package cn.toside.music.mobile.utils;

import android.util.Log;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;

public class UtilsEvent {
  final String SCREEN_STATE = "screen-state";
  final String SCREEN_SIZE_CHANGED = "screen-size-changed";

  private final ReactApplicationContext reactContext;
  UtilsEvent(ReactApplicationContext reactContext) { this.reactContext = reactContext; }

  public void sendEvent(String eventName, @Nullable WritableMap params) {
    // 新架构（bridgeless）下 getJSModule 已弃用，改用 emitDeviceEvent
    reactContext.emitDeviceEvent(eventName, params);
  }
}
