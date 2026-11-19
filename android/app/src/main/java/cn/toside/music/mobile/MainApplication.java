package cn.toside.music.mobile;

import com.facebook.react.PackageList;
import com.facebook.react.ReactHost;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.defaults.DefaultReactHost;
import com.reactnativenavigation.NavigationApplication;
import com.reactnativenavigation.react.NavigationReactNativeHost;
import java.util.List;

import cn.toside.music.mobile.cache.CachePackage;
import cn.toside.music.mobile.crypto.CryptoPackage;
import cn.toside.music.mobile.equalizer.EqualizerPackage;
import cn.toside.music.mobile.lyric.LyricPackage;
import cn.toside.music.mobile.userApi.UserApiPackage;
import cn.toside.music.mobile.utils.UtilsPackage;

public class MainApplication extends NavigationApplication {

  private final ReactNativeHost mReactNativeHost =
      new NavigationReactNativeHost(this) {
        @Override
        public boolean getUseDeveloperSupport() {
          return BuildConfig.USE_DEV_SUPPORT;
        }

        @Override
        protected List<ReactPackage> getPackages() {
          @SuppressWarnings("UnnecessaryLocalVariable")
          List<ReactPackage> packages = new PackageList(this).getPackages();
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // packages.add(new MyReactNativePackage());
          packages.add(new CachePackage());
          packages.add(new LyricPackage());
          packages.add(new UtilsPackage());
          packages.add(new CryptoPackage());
          packages.add(new UserApiPackage());
          packages.add(new EqualizerPackage());
          return packages;
        }

        @Override
        protected String getJSMainModuleName() {
          return "index";
        }

        @Override
        protected boolean isNewArchEnabled() {
          return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
        }
      };

  // RN 0.8x（新架构）启动走 ReactHost，RNN 8 的 ReactGateway 依赖该实例；
  // 缺失时启动即崩。必须按 RNN 官方安装文档提供 DefaultReactHost。
  private ReactHost mReactHost;

  @Override
  public ReactNativeHost getReactNativeHost() {
    return mReactNativeHost;
  }

  @Override
  public ReactHost getReactHost() {
    if (mReactHost == null) {
      mReactHost = DefaultReactHost.getDefaultReactHost(this, mReactNativeHost, null);
    }
    return mReactHost;
  }

  @Override
  public void onCreate() {
    // SoLoader 初始化、新架构入口加载与 ReactGateway 创建由 NavigationApplication.onCreate 负责
    super.onCreate();
  }
}
