package cn.toside.music.mobile.lyric;

import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;

public class LyricEvent {
  final String SET_VIEW_POSITION = "set-position";
  final String LYRIC_Line_PLAY = "lyric-line-play";

  private final ReactApplicationContext reactContext;
  LyricEvent(ReactApplicationContext reactContext) { this.reactContext = reactContext; }

  public void sendEvent(String eventName, @Nullable WritableMap params) {
    // Log.d("Lyric", "senEvent: " + eventName);
    // 新架构（bridgeless）下 getJSModule 已弃用，改用 emitDeviceEvent
    reactContext.emitDeviceEvent(eventName, params);
  }
}
