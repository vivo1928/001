package cn.toside.music.mobile.net;

import android.content.Context;

import com.facebook.react.modules.network.OkHttpClientFactory;
import com.facebook.react.modules.network.OkHttpClientProvider;

import java.util.concurrent.TimeUnit;

import okhttp3.Dns;
import okhttp3.OkHttpClient;

/**
 * 全局网络客户端：加连接/读取超时、优先 IPv4、记录分段耗时。
 * RN 默认客户端超时为 0（不超时），坏连接会一直占着请求。
 */
public final class NetworkClientFactory implements OkHttpClientFactory {

  private final Context appContext;

  public NetworkClientFactory(Context context) {
    this.appContext = context != null ? context.getApplicationContext() : null;
    NetworkLog.attach(this.appContext);
  }

  @Override
  public OkHttpClient createNewNetworkModuleClient() {
    OkHttpClient.Builder builder = appContext != null
        ? OkHttpClientProvider.createClientBuilder(appContext)
        : OkHttpClientProvider.createClientBuilder();
    return builder
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .dns(new Ipv4FirstDns(Dns.SYSTEM))
        .eventListenerFactory(NetworkEventLogger.FACTORY)
        .build();
  }
}