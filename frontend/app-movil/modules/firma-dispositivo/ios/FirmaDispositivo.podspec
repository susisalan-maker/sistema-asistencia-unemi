Pod::Spec.new do |s|
  s.name           = 'FirmaDispositivo'
  s.version        = '1.0.0'
  s.summary        = 'Firma de marcaciones con una clave del chip de seguridad del celular'
  s.description    = 'Crea y usa una clave P-256 dentro del Android Keystore (TEE/StrongBox) o del Secure Enclave de iOS.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
