# React Native
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.proguard.annotations.KeepGettersAndSetters *;
}
-dontwarn com.facebook.react.**
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }
-keep,includedescriptorclasses class com.facebook.react.turbomodule.** { *; }

# react-native-navigation
-keep class com.reactnativenavigation.** { *; }
-keep class com.reactnativenavigation.views.element.animators.** { *; }
-dontwarn com.reactnativenavigation.**

# QuickJS wrapper
-keep class com.whl.quickjs.** { *; }
-dontwarn com.whl.quickjs.**

# Custom native modules
-keep class cn.toside.music.mobile.crypto.** { *; }
-keep class cn.toside.music.mobile.cache.** { *; }
-keep class cn.toside.music.mobile.lyric.** { *; }
-keep class cn.toside.music.mobile.utils.** { *; }
-keep class cn.toside.music.mobile.userApi.** { *; }
-keep class cn.toside.music.mobile.MainApplication { *; }
-keep class cn.toside.music.mobile.MainActivity { *; }
-keep class cn.toside.music.mobile.ReactNativeFlipper { *; }

# Hermes
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# OkHttp / Okio
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-keep class okio.** { *; }

# Soloader
-keep class com.facebook.soloader.** { *; }

# Keep React Native JavaScript methods
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep parcelables
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Keep enums
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# org.jaudiotagger
-keep class org.jaudiotagger.tag.** { *; }

# FastImage / Glide
-keep public class com.dylanvann.fastimage.* {*;}
-keep public class com.dylanvann.fastimage.** {*;}
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep public class * extends com.bumptech.glide.module.AppGlideModule
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** {
  **[] $VALUES;
  public *;
}

# Keep attributes
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes JavascriptInterface
-keepattributes Signature
-keepattributes Exceptions