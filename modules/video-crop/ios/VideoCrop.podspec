Pod::Spec.new do |s|
  s.name           = 'VideoCrop'
  s.version        = '1.0.0'
  s.summary        = 'Center-crop recorded clips to 720x960 (3:4)'
  s.description    = 'AVFoundation-based 3:4 video crop for bree flowies'
  s.frameworks     = 'AVFoundation', 'CoreMedia'
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
