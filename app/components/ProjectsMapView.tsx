"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

type ProjectPin = {
  id: string;
  name: string;
  status: string;
  address: string | null;
  taskCount: number;
  lat: number;
  lng: number;
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#2563eb",
  ON_HOLD: "#f59e0b",
  DONE: "#22c55e",
  ARCHIVED: "#9ca3af",
};

const STATUS_RO: Record<string, string> = {
  ACTIVE: "Activ",
  ON_HOLD: "În așteptare",
  DONE: "Finalizat",
  ARCHIVED: "Arhivat",
};

export default function ProjectsMapView({ pins }: { pins: ProjectPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token || !containerRef.current || pins.length === 0) return;

    let map: import("mapbox-gl").Map;

    import("mapbox-gl").then((mbgl) => {
      if (!containerRef.current) return;
      mbgl.default.accessToken = token;

      map = new mbgl.default.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [pins[0].lng, pins[0].lat],
        zoom: 10,
      });

      map.on("load", () => {
        if (pins.length > 1) {
          const bounds = pins.reduce(
            (b, p) => b.extend([p.lng, p.lat]),
            new mbgl.default.LngLatBounds([pins[0].lng, pins[0].lat], [pins[0].lng, pins[0].lat]),
          );
          map.fitBounds(bounds, { padding: 80, maxZoom: 14 });
        }

        pins.forEach((pin) => {
          const el = document.createElement("div");
          el.style.cssText = `
            width: 32px; height: 32px; border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg); background: ${STATUS_COLOR[pin.status] ?? "#2563eb"};
            border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,.35);
            cursor: pointer; transition: transform .15s;
          `;
          el.addEventListener("mouseenter", () => { el.style.transform = "rotate(-45deg) scale(1.2)"; });
          el.addEventListener("mouseleave", () => { el.style.transform = "rotate(-45deg) scale(1)"; });

          const popup = new mbgl.default.Popup({ offset: 30, closeButton: false, maxWidth: "260px" }).setHTML(`
            <div style="font-family:system-ui,sans-serif;padding:4px 0">
              <div style="font-weight:700;font-size:14px;margin-bottom:4px">${pin.name}</div>
              <div style="font-size:12px;color:#6b7280;margin-bottom:2px">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${STATUS_COLOR[pin.status] ?? "#9ca3af"};margin-right:4px"></span>
                ${STATUS_RO[pin.status] ?? pin.status} · ${pin.taskCount} task-uri
              </div>
              ${pin.address ? `<div style="font-size:12px;color:#6b7280;margin-bottom:8px">${pin.address}</div>` : ""}
              <div style="display:flex;gap:8px;margin-top:8px">
                <a href="/projects/${pin.id}" style="font-size:12px;font-weight:600;color:#2563eb;text-decoration:none">Detalii</a>
                <a href="/tasks?scope=all&proj=${pin.id}&project=${pin.id}" style="font-size:12px;font-weight:600;color:#2563eb;text-decoration:none">Task-uri →</a>
              </div>
            </div>
          `);

          new mbgl.default.Marker({ element: el })
            .setLngLat([pin.lng, pin.lat])
            .setPopup(popup)
            .addTo(map);
        });
      });
    });

    return () => { map?.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pins.length === 0) {
    return (
      <div className="card grid place-items-center p-16 text-center text-sm text-ink-soft">
        Niciun proiect cu locație salvată. Editează un proiect și adaugă coordonate.
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[calc(100dvh-8rem)] w-full overflow-hidden rounded-2xl border border-[var(--color-line)]"
      />

      {/* Legend */}
      <div className="absolute bottom-4 left-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-lg">
        <p className="mb-2 text-xs font-semibold text-ink-soft">Legendă</p>
        <div className="flex flex-col gap-1.5">
          {Object.entries(STATUS_RO).map(([k, label]) => (
            <div key={k} className="flex items-center gap-2">
              <span
                className="size-3 rounded-full"
                style={{ background: STATUS_COLOR[k] ?? "#9ca3af" }}
              />
              <span className="text-xs">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Count badge */}
      <div className="absolute right-4 top-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 shadow-lg">
        <span className="text-sm font-semibold">{pins.length}</span>
        <span className="ml-1 text-xs text-ink-soft">proiecte pe hartă</span>
      </div>
    </div>
  );
}
