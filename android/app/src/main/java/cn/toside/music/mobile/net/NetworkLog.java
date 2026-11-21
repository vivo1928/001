package cn.toside.music.mobile.net;

import android.content.Context;
import android.os.Environment;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** 把网络分段耗时追加到 JS 同一份 lx-app.log（原生侧写文件，便于无 adb 取回） */
public final class NetworkLog {

  // 由 JS 侧通过 UtilsModule.setNetLogEnabled 同步：默认关闭，避免常驻写盘
  private static volatile boolean enabled = false;

  private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor(r -> {
    Thread t = new Thread(r, "LxNetLog");
    t.setPriority(Thread.MIN_PRIORITY);
    return t;
  });

  private static volatile File primary =
      new File(Environment.getExternalStorageDirectory(), "lx-app.log");
  private static volatile File fallback;

  private NetworkLog() {}

  static void attach(Context context) {
    if (context == null) return;
    File dir = context.getExternalFilesDir(null);
    if (dir != null) fallback = new File(dir, "lx-app.log");
  }

  public static void setEnabled(boolean value) {
    enabled = value;
  }

  static void line(String tag, String payload) {
    if (!enabled) return;
    final byte[] bytes = (System.currentTimeMillis() + " " + tag + " " + payload + "\n")
        .getBytes(StandardCharsets.UTF_8);
    EXECUTOR.execute(() -> {
      if (write(primary, bytes)) return;
      File alt = fallback;
      if (alt != null) write(alt, bytes);
    });
  }

  private static boolean write(File file, byte[] bytes) {
    try (FileOutputStream out = new FileOutputStream(file, true)) {
      out.write(bytes);
      out.flush();
      return true;
    } catch (Throwable ignored) {
      return false;
    }
  }
}