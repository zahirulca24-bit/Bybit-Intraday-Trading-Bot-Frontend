import React, { useState, useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
} from "lightweight-charts";
import {
  TrendingUp,
  BarChart2,
  Maximize2,
  RefreshCw,
  Eye,
  Sliders,
  DollarSign,
} from "lucide-react";
import { Kline, Position } from "../types";

interface TradingChartProps {
  klines: Kline[];
  selectedSymbol: string;
  selectedTimeframe: string;
  onSelectSymbol: (sym: string) => void;
  onSelectTimeframe: (tf: string) => void;
  positions: Position[];
  loading?: boolean;
}

export const TradingChart: React.FC<TradingChartProps> = ({
  klines,
  selectedSymbol,
  selectedTimeframe,
  onSelectSymbol,
  onSelectTimeframe,
  positions,
  loading = false,
}) => {
  const [hoveredKline, setHoveredKline] = useState<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);

  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "AVAXUSDT"];
  const timeframes = ["5m", "15m", "1h"];

  // Find active position for selected symbol to overlay SL/TP/Entry
  const activePosition = positions.find((p) => p.symbol === selectedSymbol);

  const latestKline = klines[klines.length - 1];
  const firstKline = klines[0];
  const priceChangePct =
    latestKline && firstKline
      ? ((latestKline.close - firstKline.close) / firstKline.close) * 100
      : 0;

  useEffect(() => {
    if (!chartContainerRef.current || loading || klines.length === 0) {
      return;
    }

    const container = chartContainerRef.current;

    // Create the chart instance
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "#0c0f17" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      rightPriceScale: {
        borderColor: "#334155",
        visible: true,
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0, // Normal crosshair
      },
      width: container.clientWidth || 700,
      height: 280,
    }) as any;

    chartRef.current = chart;

    // Lightweight Charts v5 uses the unified addSeries API.
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#38bdf8",
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "", // Overlay on main pane
    });

    // Lightweight Charts v5 exposes price-scale mutations through applyOptions().
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // Prepare data
    const seenTimes = new Set<number>();
    const candleData: any[] = [];
    const volumeData: any[] = [];

    klines.forEach((k) => {
      const timeInSecs = k.time > 1e11 ? Math.floor(k.time / 1000) : k.time;
      if (!seenTimes.has(timeInSecs)) {
        seenTimes.add(timeInSecs);
        candleData.push({
          time: timeInSecs,
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
        });
        volumeData.push({
          time: timeInSecs,
          value: k.volume,
          color: k.close >= k.open ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)",
        });
      }
    });

    // Sort by time ascending
    candleData.sort((a, b) => a.time - b.time);
    volumeData.sort((a, b) => a.time - b.time);

    if (candleData.length > 0) {
      candlestickSeries.setData(candleData);
      volumeSeries.setData(volumeData);
    }

    // Add Active Position level lines if within kline bounds
    if (activePosition) {
      if (activePosition.entryPrice) {
        candlestickSeries.createPriceLine({
          price: activePosition.entryPrice,
          color: "#06b6d4",
          lineWidth: 1.5,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: "ENTRY",
        });
      }
      if (activePosition.stopLoss) {
        candlestickSeries.createPriceLine({
          price: activePosition.stopLoss,
          color: "#f43f5e",
          lineWidth: 1.5,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: "SL",
        });
      }
      if (activePosition.takeProfit) {
        candlestickSeries.createPriceLine({
          price: activePosition.takeProfit,
          color: "#10b981",
          lineWidth: 1.5,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: "TP",
        });
      }
    }

    // Fit content
    chart.timeScale().fitContent();

    // Subscribe to crosshair move
    chart.subscribeCrosshairMove((param: any) => {
      if (
        param === undefined ||
        param.time === undefined ||
        param.point === undefined
      ) {
        setHoveredKline(null);
      } else {
        const cData = param.seriesData.get(candlestickSeries);
        const vData = param.seriesData.get(volumeSeries);
        if (cData) {
          setHoveredKline({
            time: Number(param.time),
            open: (cData as any).open,
            high: (cData as any).high,
            low: (cData as any).low,
            close: (cData as any).close,
            volume: vData ? (vData as any).value : 0,
          });
        }
      }
    });

    // ResizeObserver for responsive resizing
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width } = entries[0].contentRect;
      chart.resize(width, 280);
    });
    resizeObserver.observe(container);

    // Clean up
    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [klines, loading, activePosition]);

  return (
    <div className="bg-[#121621] border border-slate-800 rounded-lg overflow-hidden shadow-lg flex flex-col font-mono text-xs" id="tradingview-candlestick-chart">
      {/* Top Header & Symbol/Timeframe Toolbar */}
      <div className="bg-[#181d29] border-b border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Symbol Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {symbols.map((sym) => {
            const hasPos = positions.some((p) => p.symbol === sym);
            return (
              <button
                key={sym}
                onClick={() => onSelectSymbol(sym)}
                className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedSymbol === sym
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                    : "bg-[#0f131d] text-slate-400 border border-slate-800 hover:text-white hover:border-slate-700"
                }`}
              >
                <span>{sym}</span>
                {hasPos && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right Toolbar: Timeframes */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#0f131d] p-0.5 rounded border border-slate-800">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => onSelectTimeframe(tf)}
                className={`px-2.5 py-0.5 rounded text-[11px] font-semibold cursor-pointer ${
                  selectedTimeframe === tf
                    ? "bg-slate-800 text-cyan-300"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Symbol Live Price Header Stats */}
      <div className="px-3 py-2 bg-[#141824] border-b border-slate-800/80 flex flex-wrap items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <div className="font-bold text-sm text-white">{selectedSymbol}</div>
          <div className="font-mono text-base font-bold text-cyan-400">
            ${latestKline?.close?.toFixed(2) || "0.00"}
          </div>
          <div
            className={`font-semibold text-xs flex items-center gap-0.5 ${
              priceChangePct >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {priceChangePct >= 0 ? "+" : ""}
            {priceChangePct.toFixed(2)}%
          </div>
        </div>

        {/* OHLC Stats for Hovered or Latest */}
        {(hoveredKline || latestKline) && (
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-400 font-mono">
            <span>O: <strong className="text-slate-200">{(hoveredKline || latestKline)!.open.toFixed(2)}</strong></span>
            <span>H: <strong className="text-slate-200">{(hoveredKline || latestKline)!.high.toFixed(2)}</strong></span>
            <span>L: <strong className="text-slate-200">{(hoveredKline || latestKline)!.low.toFixed(2)}</strong></span>
            <span>C: <strong className="text-slate-200">{(hoveredKline || latestKline)!.close.toFixed(2)}</strong></span>
            <span>Vol: <strong className="text-slate-200">{Math.floor((hoveredKline || latestKline)!.volume)}</strong></span>
          </div>
        )}
      </div>

      {/* Lightweight Chart Container */}
      <div className="relative w-full h-[280px] bg-[#0c0f17]">
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2 bg-[#0c0f17]">
            <RefreshCw size={20} className="animate-spin text-cyan-400" />
            <span>Loading Candlestick Klines...</span>
          </div>
        ) : klines.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 bg-[#0c0f17]">
            No Kline data available for {selectedSymbol} ({selectedTimeframe}).
          </div>
        ) : (
          <div ref={chartContainerRef} className="w-full h-full" />
        )}
      </div>

      {/* Chart Footer Indicator Legend */}
      <div className="bg-[#141824] px-3 py-1.5 border-t border-slate-800 text-[10px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-cyan-400 rounded" /> Entry Price
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-rose-500 rounded" /> Stop Loss (SL)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 bg-emerald-400 rounded" /> Take Profit (TP)
          </span>
        </div>
        <span className="text-slate-500">Live Bybit Demo Feed • 1s Poll</span>
      </div>
    </div>
  );
};