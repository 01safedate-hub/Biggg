'use client';

import {useEffect, useRef} from 'react';
import {
  Chart,
  LineController,
  BarController,
  DoughnutController,
  LineElement,
  BarElement,
  ArcElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
  Tooltip,
} from 'chart.js';

Chart.register(
  LineController,
  BarController,
  DoughnutController,
  LineElement,
  BarElement,
  ArcElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
  Tooltip
);

Chart.defaults.font.family = 'Inter, sans-serif';
Chart.defaults.font.size = 11;
Chart.defaults.color = '#8C8681';

const ORANGE = '#FF6A00';
const TEAL = '#2F6B66';
const orangeSoft = 'rgba(255,106,0,0.15)';
const LINE_COLOR = '#F0E1D2';

export function OrdersChart() {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      chartRef.current?.destroy();
      chartRef.current = new Chart(ref.current, {
        type: 'line',
        data: {
          labels: ['1','2','3','4','5','6','7','8','9','10','11','12','13','14'],
          datasets: [{
            data: [520,560,540,610,650,700,690,730,760,800,820,860,890,912],
            borderColor: ORANGE,
            backgroundColor: orangeSoft,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {legend: {display: false}},
          scales: {
            y: {grid: {color: LINE_COLOR}},
            x: {grid: {display: false}},
          },
        },
      });
    } catch (err) {
      console.error('OrdersChart init error', err);
    }
    return () => chartRef.current?.destroy();
  }, []);

  return <canvas ref={ref} style={{height: 220, width: '100%'}} />;
}

export function RevenueChart() {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      chartRef.current?.destroy();
      chartRef.current = new Chart(ref.current, {
        type: 'doughnut',
        data: {
          labels: ['Platform fee', 'Promotions', 'Signup fees'],
          datasets: [{
            data: [45, 35, 20],
            backgroundColor: [ORANGE, TEAL, LINE_COLOR],
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {position: 'bottom', labels: {boxWidth: 8, padding: 12}},
          },
        },
      });
    } catch (err) {
      console.error('RevenueChart init error', err);
    }
    return () => chartRef.current?.destroy();
  }, []);

  return <canvas ref={ref} style={{height: 220, width: '100%'}} />;
}

export function ZoneChart() {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      chartRef.current?.destroy();
      chartRef.current = new Chart(ref.current, {
        type: 'bar',
        data: {
          labels: ['Awka', 'Onitsha', 'Nnewi', 'Ekwulobia', 'Ihiala'],
          datasets: [{
            data: [312, 288, 201, 94, 68],
            backgroundColor: ORANGE,
            borderRadius: 5,
            maxBarThickness: 28,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {legend: {display: false}},
          scales: {
            y: {grid: {color: LINE_COLOR}},
            x: {grid: {display: false}},
          },
        },
      });
    } catch (err) {
      console.error('ZoneChart init error', err);
    }
    return () => chartRef.current?.destroy();
  }, []);

  return <canvas ref={ref} style={{height: 220, width: '100%'}} />;
}

export function CancelChart() {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      chartRef.current?.destroy();
      chartRef.current = new Chart(ref.current, {
        type: 'line',
        data: {
          labels: ['W1','W2','W3','W4','W5','W6','W7','W8'],
          datasets: [{
            data: [6.2, 5.8, 6.5, 5.1, 4.7, 4.9, 4.2, 3.8],
            borderColor: TEAL,
            backgroundColor: 'rgba(47,107,102,0.1)',
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {legend: {display: false}},
          scales: {
            y: {grid: {color: LINE_COLOR}},
            x: {grid: {display: false}},
          },
        },
      });
    } catch (err) {
      console.error('CancelChart init error', err);
    }
    return () => chartRef.current?.destroy();
  }, []);

  return <canvas ref={ref} style={{height: 220, width: '100%'}} />;
}
