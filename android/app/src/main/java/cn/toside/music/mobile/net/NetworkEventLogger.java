package cn.toside.music.mobile.net;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.util.List;

import okhttp3.Call;
import okhttp3.EventListener;
import okhttp3.Handshake;
import okhttp3.Protocol;
import okhttp3.Response;

/**
 * 每个请求记录一次网络分段耗时：DNS、TCP 连接、TLS 握手、首字节、总耗时、协议、远端 IP。
 * 用于区分"慢在域名解析/连接建立"还是"慢在服务器或带宽"。
 */
final class NetworkEventLogger extends EventListener {

  static final Factory FACTORY = new Factory() {
    @Override
    public EventListener create(Call call) {
      return new NetworkEventLogger(call);
    }
  };

  private final Call call;
  private long startNs;
  private long dnsStartNs;
  private long connectStartNs;
  private long tlsStartNs;
  private long dnsMs = -1;
  private long connectMs = -1;
  private long tlsMs = -1;
  private long ttfbMs = -1;
  private long totalMs = -1;
  private long bytes;
  private int code;
  private String protocol = "";
  private String ip = "";
  private String cache = "";
  private boolean finished;

  private NetworkEventLogger(Call call) {
    this.call = call;
  }

  private long since(long start) {
    return start <= 0 ? -1 : (System.nanoTime() - start) / 1_000_000L;
  }

  @Override
  public void callStart(Call call) {
    startNs = System.nanoTime();
  }

  @Override
  public void dnsStart(Call call, String domainName) {
    dnsStartNs = System.nanoTime();
  }

  @Override
  public void dnsEnd(Call call, String domainName, List<InetAddress> inetAddressList) {
    dnsMs = since(dnsStartNs);
  }

  @Override
  public void connectStart(Call call, InetSocketAddress inetSocketAddress, Proxy proxy) {
    connectStartNs = System.nanoTime();
  }

  @Override
  public void connectEnd(Call call, InetSocketAddress inetSocketAddress, Proxy proxy, Protocol protocol) {
    connectMs = since(connectStartNs);
    if (inetSocketAddress != null && inetSocketAddress.getAddress() != null) {
      ip = inetSocketAddress.getAddress().getHostAddress();
    }
    if (protocol != null) this.protocol = protocol.toString();
  }

  @Override
  public void secureConnectStart(Call call) {
    tlsStartNs = System.nanoTime();
  }

  @Override
  public void secureConnectEnd(Call call, Handshake handshake) {
    tlsMs = since(tlsStartNs);
  }

  @Override
  public void responseHeadersStart(Call call) {
    ttfbMs = since(startNs);
  }

  @Override
  public void responseHeadersEnd(Call call, Response response) {
    code = response.code();
    if (response.protocol() != null) protocol = response.protocol().toString();
  }

  @Override
  public void responseBodyEnd(Call call, long byteCount) {
    bytes += byteCount;
  }

  @Override
  public void cacheHit(Call call, Response response) {
    cache = "hit";
  }

  @Override
  public void cacheMiss(Call call) {
    cache = "miss";
  }

  @Override
  public void callEnd(Call call) {
    totalMs = since(startNs);
    log(true, null);
  }

  @Override
  public void callFailed(Call call, IOException ioe) {
    totalMs = since(startNs);
    log(false, ioe);
  }

  private static String escape(String value) {
    if (value == null) return "";
    int max = Math.min(value.length(), 200);
    StringBuilder sb = new StringBuilder(max);
    for (int i = 0; i < max; i++) {
      char c = value.charAt(i);
      if (c == '"' || c == '\\') sb.append('\\').append(c);
      else if (c < 0x20) sb.append(' ');
      else sb.append(c);
    }
    return sb.toString();
  }

  private void log(boolean ok, IOException error) {
    if (finished) return;
    finished = true;
    String host = call.request().url().host();
    String path = call.request().url().encodedPath();
    StringBuilder sb = new StringBuilder(256);
    sb.append('{')
        .append("\"ok\":").append(ok)
        .append(",\"m\":\"").append(escape(call.request().method())).append('"')
        .append(",\"host\":\"").append(escape(host)).append('"')
        .append(",\"path\":\"").append(escape(path)).append('"')
        .append(",\"dns\":").append(dnsMs)
        .append(",\"connect\":").append(connectMs)
        .append(",\"tls\":").append(tlsMs)
        .append(",\"ttfb\":").append(ttfbMs)
        .append(",\"total\":").append(totalMs)
        .append(",\"code\":").append(code)
        .append(",\"proto\":\"").append(escape(protocol)).append('"')
        .append(",\"ip\":\"").append(escape(ip)).append('"')
        .append(",\"bytes\":").append(bytes);
    if (!cache.isEmpty()) sb.append(",\"cache\":\"").append(cache).append('"');
    if (error != null) sb.append(",\"err\":\"").append(escape(String.valueOf(error.getMessage()))).append('"');
    sb.append('}');
    NetworkLog.line("net", sb.toString());
  }
}