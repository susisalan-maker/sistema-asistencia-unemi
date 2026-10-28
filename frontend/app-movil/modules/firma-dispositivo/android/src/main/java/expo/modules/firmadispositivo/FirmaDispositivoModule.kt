package expo.modules.firmadispositivo

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * Firma de marcaciones con una clave del Android Keystore.
 *
 * La clave (ECDSA P-256) se crea DENTRO del chip de seguridad del teléfono (StrongBox si lo tiene, si no el TEE) y su parte
 * privada no se puede exportar: ni con root ni con el modo desarrollador. Lo único que sale es la firma. Todo ocurre en el
 * propio celular, sin internet.
 *
 * Qué va a dónde: `crearClaveAsync` devuelve la clave PÚBLICA (X.509 SubjectPublicKeyInfo, base64) y la cadena de
 * certificados que el chip emite para esa clave («key attestation», con el desafío que le pasamos); el servidor la usa para
 * comprobar que la clave está en el hardware. `firmarAsync` devuelve la firma ECDSA/SHA-256 en DER (base64).
 *
 * NO se ha podido probar aquí (no hay un Android donde correrlo): se prueba con la APK en un celular real
 * (ver PRUEBA-LOCAL.md, caso «Firma con la clave del celular»).
 */
internal class FirmaException(code: String, reason: String, cause: Throwable? = null) :
  CodedException(code, "[FirmaDispositivo]: $reason", cause)

class FirmaDispositivoModule : Module() {
  companion object {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val CURVA = "secp256r1"
  }

  override fun definition() = ModuleDefinition {
    Name("FirmaDispositivo")

    // ¿Se puede usar el Keystore en este celular?
    Function("soportado") {
      try {
        almacen()
        true
      } catch (e: Exception) {
        false
      }
    }

    Function("existeClave") { alias: String ->
      almacen().containsAlias(alias)
    }

    // La clave pública (SPKI en base64) o null si no hay clave con ese alias.
    Function("clavePublica") { alias: String ->
      val certificado = almacen().getCertificate(alias)
      certificado?.let { Base64.encodeToString(it.publicKey.encoded, Base64.NO_WRAP) }
    }

    // La cadena de certificados de la clave (hoja primero) o null si no la hay.
    Function("cadena") { alias: String ->
      cadenaDe(alias)
    }

    Function("borrarClave") { alias: String ->
      val ks = almacen()
      if (ks.containsAlias(alias)) {
        ks.deleteEntry(alias)
      }
      Unit
    }

    // Crea la clave (si ya había una con ese alias, la reemplaza). `desafio` es base64 y va dentro de la prueba de hardware.
    AsyncFunction("crearClaveAsync") { alias: String, desafio: String ->
      try {
        crear(alias, Base64.decode(desafio, Base64.DEFAULT))
      } catch (e: FirmaException) {
        throw e
      } catch (e: Exception) {
        throw FirmaException("FALLO_AL_CREAR", e.message ?: "No se pudo crear la clave", e)
      }
    }

    // Firma `mensaje` (texto UTF-8) con ECDSA/SHA-256. Devuelve la firma en DER, base64.
    AsyncFunction("firmarAsync") { alias: String, mensaje: String ->
      try {
        val privada = almacen().getKey(alias, null) as? PrivateKey
          ?: throw FirmaException("CLAVE_NO_ENCONTRADA", "No hay una clave con el alias $alias")
        val firma = Signature.getInstance("SHA256withECDSA")
        firma.initSign(privada)
        firma.update(mensaje.toByteArray(Charsets.UTF_8))
        Base64.encodeToString(firma.sign(), Base64.NO_WRAP)
      } catch (e: FirmaException) {
        throw e
      } catch (e: Exception) {
        throw FirmaException("FALLO_AL_FIRMAR", e.message ?: "No se pudo firmar", e)
      }
    }
  }

  private fun almacen(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

  private fun cadenaDe(alias: String): List<String>? {
    val cadena = almacen().getCertificateChain(alias) ?: return null
    return cadena.map { Base64.encodeToString(it.encoded, Base64.NO_WRAP) }
  }

  /** Crea la clave probando, en orden: StrongBox con prueba de hardware → TEE con prueba → TEE sin prueba. */
  private fun crear(alias: String, desafio: ByteArray): Map<String, Any> {
    val ks = almacen()
    if (ks.containsAlias(alias)) ks.deleteEntry(alias)

    val intentos = mutableListOf<Pair<Boolean, Boolean>>()   // (StrongBox, con prueba de hardware)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) intentos.add(Pair(true, true))
    intentos.add(Pair(false, true))
    intentos.add(Pair(false, false))

    var ultimoError: Exception? = null
    for ((strongBox, conPrueba) in intentos) {
      try {
        generar(alias, desafio, strongBox, conPrueba)
        val resultado = mutableMapOf<String, Any>(
          "clavePublica" to Base64.encodeToString(ks.getCertificate(alias).publicKey.encoded, Base64.NO_WRAP),
          "nivel" to nivelDe(alias),
        )
        // Sin `cadena` si este celular no pudo emitir la prueba de hardware.
        if (conPrueba) cadenaDe(alias)?.let { resultado["cadena"] = it }
        return resultado
      } catch (e: Exception) {
        // Este celular no admite esa combinación (p. ej. sin StrongBox): se limpia y se prueba la siguiente.
        ultimoError = e
        if (ks.containsAlias(alias)) ks.deleteEntry(alias)
      }
    }
    throw FirmaException("FALLO_AL_CREAR", ultimoError?.message ?: "No se pudo crear la clave", ultimoError)
  }

  private fun generar(alias: String, desafio: ByteArray, strongBox: Boolean, conPrueba: Boolean) {
    val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
      .setAlgorithmParameterSpec(ECGenParameterSpec(CURVA))
      .setDigests(KeyProperties.DIGEST_SHA256)
      // Se firma en segundo plano y sin que la persona toque nada: la identidad ya la comprueba el rostro.
      .setUserAuthenticationRequired(false)
    if (conPrueba) spec.setAttestationChallenge(desafio)
    if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) spec.setIsStrongBoxBacked(true)
    val generador = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)
    generador.initialize(spec.build())
    generador.generateKeyPair()
  }

  /** Dónde vive la clave según el propio sistema: «strongbox», «tee» o «software». */
  @Suppress("DEPRECATION")
  private fun nivelDe(alias: String): String {
    return try {
      val privada = almacen().getKey(alias, null) as PrivateKey
      val info = KeyFactory.getInstance(privada.algorithm, ANDROID_KEYSTORE).getKeySpec(privada, KeyInfo::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        when (info.securityLevel) {
          KeyProperties.SECURITY_LEVEL_STRONGBOX -> "strongbox"
          KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "tee"
          else -> "software"
        }
      } else {
        if (info.isInsideSecureHardware) "tee" else "software"
      }
    } catch (e: Exception) {
      "software"
    }
  }
}
