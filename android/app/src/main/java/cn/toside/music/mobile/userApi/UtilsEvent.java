package cn.toside.music.mobile.userApi;

import android.util.Log;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;

public class UtilsEvent {
  final String API_ACTION = "api-action";
  private final ReactApplicationContext reactContext;

  UtilsEvent(ReactApplicationContext reactContext) {
    this.reactContext = reactContext;
  }

  public void sendEvent(String eventName, @Nullable WritableMap params) {
    // 新架构（bridgeless）下 getJSModule 已弃用，改用 emitDeviceEvent
    reactContext.emitDeviceEvent(eventName, params);
  }
}
