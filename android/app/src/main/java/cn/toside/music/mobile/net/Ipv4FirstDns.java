package cn.toside.music.mobile.net;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import okhttp3.Dns;

/**
 * 优先返回 IPv4 地址。
 * 部分移动网络到境外/双栈域名会先尝试 IPv6，连不通时要等完整的连接超时才回退 IPv4，
 * 表现为"每个请求都慢几秒"。把 IPv4 排在前面可避免这段等待；只有 IPv6 时保持原样。
 */
final class Ipv4FirstDns implements Dns {

  private final Dns system;

  Ipv4FirstDns(Dns system) {
    this.system = system;
  }

  @Override
  public List<InetAddress> lookup(String hostname) throws UnknownHostException {
    List<InetAddress> all = system.lookup(hostname);
    if (all == null) return Collections.emptyList();
    if (all.size() < 2) return all;

    List<InetAddress> v4 = new ArrayList<>(all.size());
    List<InetAddress> v6 = new ArrayList<>(all.size());
    for (InetAddress address : all) {
      if (address instanceof Inet4Address) v4.add(address);
      else v6.add(address);
    }
    if (v4.isEmpty()) return all;
    v4.addAll(v6);
    return v4;
  }
}