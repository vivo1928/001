package com.guichaguri.trackplayer.service;

import android.app.Application;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import androidx.annotation.Nullable;
import com.facebook.react.ReactApplication;
import com.facebook.react.ReactHost;
import com.facebook.react.ReactInstanceEventListener;
import com.facebook.react.ReactInstanceManager;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.UiThreadUtil;
import com.facebook.react.jstasks.HeadlessJsTaskConfig;
import com.facebook.react.jstasks.HeadlessJsTaskContext;
import com.facebook.react.jstasks.HeadlessJsTaskEventListener;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;

// https://github.com/facebook/react-native/blob/cbd818dad7748fbe38c8bbf272f1cdfdf195d20f/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/HeadlessJsTaskService.java
/**
 * Base class for running JS without a UI. Generally, you only need to override {@link
 * #getTaskConfig}, which is called for every {@link #onStartCommand}. The result, if not {@code
 * null}, is used to run a JS task.
 */
public abstract class HeadlessJsTaskService extends Service implements HeadlessJsTaskEventListener {

  private final Set<Integer> mActiveTasks = new CopyOnWriteArraySet<>();
  // private static @Nullable PowerManager.WakeLock sWakeLock;

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    HeadlessJsTaskConfig taskConfig = getTaskConfig(intent);
    if (taskConfig != null) {
      startTask(taskConfig);
      return START_REDELIVER_INTENT;
    }
    return START_NOT_STICKY;
  }

  /**
   * Called from {@link #onStartCommand} to create a {@link HeadlessJsTaskConfig} for this intent.
   *
   * @param intent the {@link Intent} received in {@link #onStartCommand}.
   * @return a {@link HeadlessJsTaskConfig} to be used with {@link #startTask}, or {@code null} to
   *     ignore this command.
   */
  protected @Nullable HeadlessJsTaskConfig getTaskConfig(Intent intent) {
    return null;
  }

  /**
   * Acquire a wake lock to ensure the device doesn't go to sleep while processing background tasks.
   */
  // @SuppressLint("WakelockTimeout")
  // public static void acquireWakeLockNow(Context context) {
  //   if (sWakeLock == null || !sWakeLock.isHeld()) {
  //     PowerManager powerManager =
  //       Assertions.assertNotNull((PowerManager) context.getSystemService(POWER_SERVICE));
  //     sWakeLock =
  //       powerManager.newWakeLock(
  //         PowerManager.PARTIAL_WAKE_LOCK, HeadlessJsTaskService.class.getCanonicalName());
  //     sWakeLock.setReferenceCounted(false);
  //     sWakeLock.acquire();
  //   }
  // }

  @Override
  public @Nullable IBinder onBind(Intent intent) {
    return null;
  }

  /**
   * Start a task. This method handles starting a new React instance if required.
   *
   * <p>Has to be called on the UI thread.
   *
   * @param taskConfig describes what task to start and the parameters to pass to it
   */
  protected void startTask(final HeadlessJsTaskConfig taskConfig) {
    UiThreadUtil.assertOnUiThread();
    // acquireWakeLockNow(this);
    // RN 0.82+ 新架构（bridgeless）下 ReactInstanceManager 不可用，改用 ReactHost
    final ReactHost reactHost = getReactHostCompat();
    if (reactHost != null) {
      ReactContext currentContext = reactHost.getCurrentReactContext();
      if (currentContext != null) {
        invokeStartTask(currentContext, taskConfig);
        return;
      }
      final ReactInstanceEventListener[] listenerRef = new ReactInstanceEventListener[1];
      listenerRef[0] = new ReactInstanceEventListener() {
        @Override
        public void onReactContextInitialized(ReactContext reactContext) {
          reactHost.removeReactInstanceEventListener(listenerRef[0]);
          invokeStartTask(reactContext, taskConfig);
        }
      };
      reactHost.addReactInstanceEventListener(listenerRef[0]);
      try {
        reactHost.start();
      } catch (Throwable ignored) { /* 启动失败时等待后续 startSurface 触发 */ }
      return;
    }
    final ReactInstanceManager reactInstanceManager =
      getReactNativeHost().getReactInstanceManager();
    ReactContext reactContext = reactInstanceManager.getCurrentReactContext();
    if (reactContext == null) {
      reactInstanceManager.addReactInstanceEventListener(
        new ReactInstanceEventListener() {
          @Override
          public void onReactContextInitialized(ReactContext reactContext) {
            invokeStartTask(reactContext, taskConfig);
            reactInstanceManager.removeReactInstanceEventListener(this);
          }
        });
      reactInstanceManager.createReactContextInBackground();
    } else {
      invokeStartTask(reactContext, taskConfig);
    }
  }

  private void invokeStartTask(ReactContext reactContext, final HeadlessJsTaskConfig taskConfig) {
    final HeadlessJsTaskContext headlessJsTaskContext =
      HeadlessJsTaskContext.getInstance(reactContext);
    headlessJsTaskContext.addTaskEventListener(this);

    UiThreadUtil.runOnUiThread(() -> {
      int taskId = headlessJsTaskContext.startTask(taskConfig);
      mActiveTasks.add(taskId);
    });
  }

  @Override
  public void onDestroy() {
    super.onDestroy();

    ReactContext reactContext = getCurrentReactContextCompat();
    if (reactContext != null) {
      HeadlessJsTaskContext headlessJsTaskContext =
        HeadlessJsTaskContext.getInstance(reactContext);
      headlessJsTaskContext.removeTaskEventListener(this);
    }
    // if (sWakeLock != null) {
    //   sWakeLock.release();
    // }
  }

  @Override
  public void onHeadlessJsTaskStart(int taskId) {}

  @Override
  public void onHeadlessJsTaskFinish(int taskId) {
    mActiveTasks.remove(taskId);
    if (mActiveTasks.size() == 0) {
      stopSelf();
    }
  }


  protected ReactNativeHost getReactNativeHost() {
    return ((ReactApplication) getApplication()).getReactNativeHost();
  }

  // 通过反射读取 Application.getReactHost()，避免硬依赖具体宿主接口
  protected static @Nullable ReactHost findReactHost(Application application) {
    try {
      java.lang.reflect.Method method = application.getClass().getMethod("getReactHost");
      Object host = method.invoke(application);
      if (host instanceof ReactHost) return (ReactHost) host;
    } catch (Throwable ignored) { /* 旧架构宿主无此方法 */ }
    return null;
  }

  protected @Nullable ReactHost getReactHostCompat() {
    return findReactHost(getApplication());
  }

  /**
   * 是否处于前台：ReactHost 生命周期为 RESUMED 视为前台。
   * 返回 null 表示无法判断（调用方应保守处理）。
   */
  protected @Nullable Boolean isAppInForegroundCompat(ReactContext reactContext) {
    ReactHost reactHost = getReactHostCompat();
    if (reactHost != null) {
      try {
        return reactHost.getLifecycleState() == com.facebook.react.common.LifecycleState.RESUMED;
      } catch (Throwable ignored) { /* ignore */ }
    }
    if (reactContext != null) {
      try {
        return reactContext.hasCurrentActivity();
      } catch (Throwable ignored) { /* ignore */ }
    }
    return null;
  }

  /** 新架构优先取 ReactHost 的上下文，旧架构回退 ReactInstanceManager */
  protected @Nullable ReactContext getCurrentReactContextCompat() {
    ReactHost reactHost = getReactHostCompat();
    if (reactHost != null) return reactHost.getCurrentReactContext();
    try {
      if (getReactNativeHost().hasInstance()) {
        return getReactNativeHost().getReactInstanceManager().getCurrentReactContext();
      }
    } catch (Throwable ignored) { /* bridgeless 下构造会抛异常 */ }
    return null;
  }
}
