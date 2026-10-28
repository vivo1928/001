package cn.toside.music.mobile.equalizer;

import android.content.Context;

import androidx.annotation.Nullable;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.exoplayer.audio.AudioSink;
import androidx.media3.exoplayer.audio.DefaultAudioSink;

/**
 * 自定义 RenderersFactory，注入均衡器 AudioProcessor
 */
@UnstableApi
public class EqRenderersFactory extends DefaultRenderersFactory {
    private static EqualizerAudioProcessor eqAudioProcessor;

    public static EqualizerAudioProcessor getEqualizerAudioProcessor() {
        if (eqAudioProcessor == null) {
            eqAudioProcessor = new EqualizerAudioProcessor();
        }
        return eqAudioProcessor;
    }

    public EqRenderersFactory(Context context) {
        super(context);
        // 通过反射打开 RenderersFactory 的 offload 能力（不同 media3 小版本方法名可能不同，
        // 反射失败就静默跳过，不影响编译与普通播放）。
        // 仅打开"能力"，是否真正走 offload 由运行时 AudioOffloadPreferences 控制（默认关闭）。
        try {
            java.lang.reflect.Method m = DefaultRenderersFactory.class
                    .getMethod("setEnableAudioOffload", boolean.class);
            m.invoke(this, true);
        } catch (Throwable ignore) {
        }
    }

    @Override
    @Nullable
    protected AudioSink buildAudioSink(
            Context context,
            boolean enableFloatOutput,
            boolean enableAudioTrackPlaybackParams) {

        // 构建音频处理器列表 - 将均衡器放在第一个位置
        AudioProcessor[] processors = new AudioProcessor[] {
            getEqualizerAudioProcessor()
        };

        DefaultAudioSink.Builder builder = new DefaultAudioSink.Builder(context)
                .setAudioProcessors(processors)
                .setEnableFloatOutput(enableFloatOutput)
                .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams);

        // 给自定义 sink 打开 offload 能力（仅能力，运行时由 AudioOffloadPreferences 决定是否使用）。
        // 不同 media3 小版本方法名可能不同，反射失败静默跳过，不影响编译与普通播放。
        try {
            java.lang.reflect.Method m = DefaultAudioSink.Builder.class
                    .getMethod("setEnableAudioOffload", boolean.class);
            m.invoke(builder, true);
        } catch (Throwable ignore) {
        }

        return builder
                .setAudioTrackBufferSizeProvider(
                    (minBufferSizeInBytes,
                     encoding,
                     outputMode,
                     pcmFrameSize,
                     sampleRate,
                     bitrate,
                     maxAudioTrackPlaybackSpeed) -> {
                        if (outputMode == DefaultAudioSink.OUTPUT_MODE_PCM) {
                            // media3 默认 PCM 缓冲上限仅 750ms，音频写入节奏抖动时
                            // 容易触发 AudioTrack underrun 导致偶发"顿一下"。
                            // 提升到 1.5s 缓冲吸收写入抖动，减少欠载卡顿。
                            long targetUs = 1_500_000L;
                            long bufferSize = (long) sampleRate * pcmFrameSize
                                    * targetUs / 1_000_000L;
                            long result = Math.max(minBufferSizeInBytes, bufferSize);
                            if (result > Integer.MAX_VALUE) {
                                return Integer.MAX_VALUE;
                            }
                            return (int) result;
                        }
                        return minBufferSizeInBytes;
                    })
                .build();
    }
}
