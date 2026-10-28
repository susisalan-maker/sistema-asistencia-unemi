import ExpoModulesCore
import Foundation
import Security

/// Firma de marcaciones con una clave del Secure Enclave.
///
/// La clave (ECDSA P-256) se crea DENTRO del Secure Enclave, el chip de seguridad del iPhone: su parte privada no se puede
/// exportar ni con el teléfono desbloqueado por jailbreak. Lo único que sale es la firma. Todo ocurre en el propio celular,
/// sin internet.
///
/// `crearClaveAsync` devuelve la clave PÚBLICA (SubjectPublicKeyInfo, base64). `firmarAsync` devuelve la firma ECDSA/SHA-256
/// en DER (base64), el mismo formato que Android, para que el servidor las verifique igual.
///
/// En iOS no hay una «cadena de atestación» sin pasar por App Attest de Apple (queda como trabajo futuro): `cadena` es null.
///
/// NO se ha podido probar aquí (no hay un Mac donde compilarlo ni un iPhone donde correrlo): se prueba con una compilación
/// de desarrollo en un iPhone real (ver PRUEBA-LOCAL.md, caso «Firma con la clave del celular»). El Simulador no tiene
/// Secure Enclave: allí `soportado` es falso y la app sigue como si no existiera.
internal final class FirmaException: Exception {
  init(_ message: String, code: String) {
    super.init(name: "FirmaException", description: "[FirmaDispositivo]: \(message)", code: code)
  }
}

public class FirmaDispositivoModule: Module {
  // Cabecera fija de SubjectPublicKeyInfo para una clave P-256: SEQUENCE { SEQUENCE { id-ecPublicKey, prime256v1 }, BIT STRING }.
  // Pegada delante del punto sin comprimir de 65 bytes que entrega iOS, da el mismo formato que Android y que `cryptography`.
  private static let cabeceraSpkiP256: [UInt8] = [
    0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01,
    0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
  ]

  public func definition() -> ModuleDefinition {
    Name("FirmaDispositivo")

    // ¿Tiene este iPhone Secure Enclave? (El Simulador no.)
    Function("soportado") { () -> Bool in
      #if targetEnvironment(simulator)
      return false
      #else
      return true
      #endif
    }

    Function("existeClave") { (alias: String) -> Bool in
      return self.buscar(alias) != nil
    }

    // La clave pública (SPKI en base64) o nil si no hay clave con ese alias.
    Function("clavePublica") { (alias: String) -> String? in
      guard let privada = self.buscar(alias) else { return nil }
      return try? self.publicaEnBase64(privada)
    }

    // En iOS no hay cadena de certificados.
    Function("cadena") { (alias: String) -> [String]? in
      return nil
    }

    Function("borrarClave") { (alias: String) in
      _ = SecItemDelete(self.consulta(alias) as CFDictionary)
    }

    // Crea la clave en el Secure Enclave (si ya había una con ese alias, la reemplaza). `desafio` no se usa en iOS.
    AsyncFunction("crearClaveAsync") { (alias: String, desafio: String) -> [String: Any] in
      _ = SecItemDelete(self.consulta(alias) as CFDictionary)

      var error: Unmanaged<CFError>?
      guard let acceso = SecAccessControlCreateWithFlags(
        kCFAllocatorDefault,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly,   // solo en este iPhone, sin copia de seguridad, con el teléfono desbloqueado
        .privateKeyUsage,                                // la clave se usa dentro del Secure Enclave, sin pedir huella a cada firma
        &error
      ) else {
        throw FirmaException(Self.texto(error, "No se pudo configurar el acceso a la clave"), code: "FALLO_AL_CREAR")
      }

      let atributos: [String: Any] = [
        kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
        kSecAttrKeySizeInBits as String: 256,
        kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
        kSecPrivateKeyAttrs as String: [
          kSecAttrIsPermanent as String: true,
          kSecAttrApplicationTag as String: Data(alias.utf8),
          kSecAttrAccessControl as String: acceso,
        ] as [String: Any],
      ]
      guard let privada = SecKeyCreateRandomKey(atributos as CFDictionary, &error) else {
        throw FirmaException(Self.texto(error, "No se pudo crear la clave en el Secure Enclave"), code: "FALLO_AL_CREAR")
      }
      // Sin `cadena`: en iOS no hay cadena de certificados.
      return [
        "clavePublica": try self.publicaEnBase64(privada),
        "nivel": "enclave",
      ]
    }

    // Firma `mensaje` (texto UTF-8) con ECDSA/SHA-256. Devuelve la firma en DER (X9.62), base64.
    AsyncFunction("firmarAsync") { (alias: String, mensaje: String) -> String in
      guard let privada = self.buscar(alias) else {
        throw FirmaException("No hay una clave con el alias \(alias)", code: "CLAVE_NO_ENCONTRADA")
      }
      var error: Unmanaged<CFError>?
      guard let firma = SecKeyCreateSignature(
        privada, .ecdsaSignatureMessageX962SHA256, Data(mensaje.utf8) as CFData, &error
      ) as Data? else {
        throw FirmaException(Self.texto(error, "No se pudo firmar"), code: "FALLO_AL_FIRMAR")
      }
      return firma.base64EncodedString()
    }
  }

  private func consulta(_ alias: String) -> [String: Any] {
    return [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: Data(alias.utf8),
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
    ]
  }

  private func buscar(_ alias: String) -> SecKey? {
    var consulta = self.consulta(alias)
    consulta[kSecReturnRef as String] = true
    var resultado: CFTypeRef?
    guard SecItemCopyMatching(consulta as CFDictionary, &resultado) == errSecSuccess, let clave = resultado else {
      return nil
    }
    return (clave as! SecKey)
  }

  private func publicaEnBase64(_ privada: SecKey) throws -> String {
    var error: Unmanaged<CFError>?
    guard let publica = SecKeyCopyPublicKey(privada),
          let punto = SecKeyCopyExternalRepresentation(publica, &error) as Data? else {
      throw FirmaException(Self.texto(error, "No se pudo leer la clave pública"), code: "FALLO_AL_CREAR")
    }
    return (Data(Self.cabeceraSpkiP256) + punto).base64EncodedString()
  }

  private static func texto(_ error: Unmanaged<CFError>?, _ respaldo: String) -> String {
    guard let e = error?.takeRetainedValue() else { return respaldo }
    return "\(respaldo): \(CFErrorCopyDescription(e) as String? ?? "sin detalle")"
  }
}
