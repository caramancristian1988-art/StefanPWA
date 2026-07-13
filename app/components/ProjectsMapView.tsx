"use client";

import { useEffect, useRef } from "react";
import "mapbox-gl/dist/mapbox-gl.css";

type ProjectPin = {
  id: string;
  seq: number | null;
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

function pinPopupHtml(pin: { id: string; seq?: number | null; name: string; status: string; address: string | null; taskCount: number }) {
  const seq = pin.seq != null ? `<span style="font-family:monospace;font-size:11px;background:#eff6ff;color:#2563eb;padding:1px 6px;border-radius:4px;margin-right:6px">#${String(pin.seq).padStart(3, "0")}</span>` : "";
  return `
    <div style="font-family:system-ui,sans-serif;padding:4px 0;min-width:180px">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">${seq}${pin.name}</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:2px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${STATUS_COLOR[pin.status] ?? "#9ca3af"};margin-right:4px"></span>
        ${STATUS_RO[pin.status] ?? pin.status} · ${pin.taskCount} task-uri
      </div>
      ${pin.address ? `<div style="font-size:12px;color:#6b7280;margin-bottom:8px">${pin.address}</div>` : ""}
      <div style="display:flex;gap:8px;margin-top:8px">
        <a href="/projects/${pin.id}" style="font-size:12px;font-weight:600;color:#2563eb;text-decoration:none">Detalii →</a>
        <a href="/tasks?scope=all&proj=${pin.id}" style="font-size:12px;font-weight:600;color:#2563eb;text-decoration:none">Task-uri →</a>
      </div>
    </div>
  `;
}

function clusterPopupHtml(leaves: { properties: Record<string, unknown> }[]) {
  const items = leaves
    .map((f) => {
      const p = f.properties;
      const seq = p.seq != null ? `<span style="font-family:monospace;font-size:10px;background:#eff6ff;color:#2563eb;padding:1px 5px;border-radius:4px;margin-right:5px">#${String(p.seq).padStart(3, "0")}</span>` : "";
      return `
        <div style="padding:6px 0;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:6px">
          <span style="display:inline-block;width:8px;height:8px;flex-shrink:0;border-radius:50%;background:${STATUS_COLOR[p.status as string] ?? "#9ca3af"}"></span>
          <div style="min-width:0;flex:1">
            <div style="font-size:13px;font-weight:600">${seq}${p.name}</div>
            <div style="font-size:11px;color:#6b7280">${STATUS_RO[p.status as string] ?? p.status} · ${p.taskCount} task-uri</div>
          </div>
          <a href="/projects/${p.id}" style="font-size:12px;font-weight:600;color:#2563eb;text-decoration:none;flex-shrink:0">→</a>
        </div>
      `;
    })
    .join("");
  return `
    <div style="font-family:system-ui,sans-serif;padding:4px 0;min-width:220px;max-height:300px;overflow-y:auto">
      <div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:4px">${leaves.length} proiecte în această zonă</div>
      ${items}
    </div>
  `;
}

export default function ProjectsMapView({ pins }: { pins: ProjectPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!token || !containerRef.current || pins.length === 0) return;

    let map: import("mapbox-gl").Map;

    import("mapbox-gl").then((mbgl) => {
      if (!containerRef.current) return;
      mbgl.default.accessToken = token;

      map = new mbgl.default.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [pins[0].lng, pins[0].lat],
        zoom: 7,
      });

      map.on("load", () => {
        // ── Fit bounds ──
        if (pins.length > 1) {
          const bounds = pins.reduce(
            (b, p) => b.extend([p.lng, p.lat]),
            new mbgl.default.LngLatBounds([pins[0].lng, pins[0].lat], [pins[0].lng, pins[0].lat]),
          );
          map.fitBounds(bounds, { padding: 80, maxZoom: 13 });
        }

        // ── GeoJSON source cu clustering ──
        map.addSource("projects", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: pins.map((p) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [p.lng, p.lat] },
              properties: {
                id: p.id,
                seq: p.seq,
                name: p.name,
                status: p.status,
                address: p.address,
                taskCount: p.taskCount,
              },
            })),
          },
          cluster: true,
          clusterMaxZoom: 15,
          clusterRadius: 45,
        });

        // ── Layer: cercuri cluster ──
        map.addLayer({
          id: "clusters",
          type: "circle",
          source: "projects",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#2563eb",
            "circle-radius": ["step", ["get", "point_count"], 22, 5, 30, 20, 38],
            "circle-stroke-width": 3,
            "circle-stroke-color": "#fff",
            "circle-opacity": 0.9,
          },
        });

        // ── Layer: numărul din cluster ──
        map.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "projects",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            "text-size": 14,
          },
          paint: { "text-color": "#ffffff" },
        });

        // ── Layer: punct individual ──
        map.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "projects",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": [
              "match", ["get", "status"],
              "ACTIVE",   "#2563eb",
              "ON_HOLD",  "#f59e0b",
              "DONE",     "#22c55e",
              "ARCHIVED", "#9ca3af",
              "#6b7280",
            ],
            "circle-radius": 11,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#ffffff",
          },
        });

        // ── Click pe cluster → popup cu lista proiectelor ──
        map.on("click", "clusters", async (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
          if (!features.length) return;
          const clusterId = features[0].properties?.cluster_id as number;
          const source = map.getSource("projects") as import("mapbox-gl").GeoJSONSource;

          try {
            const leaves = await source.getClusterLeaves(clusterId, 100, 0);
            new mbgl.default.Popup({ maxWidth: "280px" })
              .setLngLat(e.lngLat)
              .setHTML(clusterPopupHtml(leaves as { properties: Record<string, unknown> }[]))
              .addTo(map);
          } catch {
            // ignoră erori de cluster
          }
        });

        // ── Click pe punct individual → popup ──
        map.on("click", "unclustered-point", (e) => {
          const features = map.queryRenderedFeatures(e.point, { layers: ["unclustered-point"] });
          if (!features.length) return;
          const p = features[0].properties as Record<string, unknown>;
          new mbgl.default.Popup({ maxWidth: "280px" })
            .setLngLat(e.lngLat)
            .setHTML(pinPopupHtml({
              id: p.id as string,
              seq: p.seq as number | null,
              name: p.name as string,
              status: p.status as string,
              address: p.address as string | null,
              taskCount: p.taskCount as number,
            }))
            .addTo(map);
        });

        // ── Cursor pointer la hover ──
        map.on("mouseenter", "clusters", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; });
        map.on("mouseenter", "unclustered-point", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "unclustered-point", () => { map.getCanvas().style.cursor = ""; });
      });
    });

    return () => { map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!token) {
    return (
      <div className="card grid place-items-center p-16 text-center text-sm text-ink-soft">
        <p className="mb-1 font-semibold text-ink">Hartă indisponibilă</p>
        <p>
          Variabila <code className="rounded bg-[var(--color-surface-2)] px-1">NEXT_PUBLIC_MAPBOX_TOKEN</code> nu este configurată.
        </p>
      </div>
    );
  }

  if (pins.length === 0) {
    return (
      <div className="card grid place-items-center p-16 text-center text-sm text-ink-soft">
        <p className="mb-1 font-semibold text-ink">Niciun proiect cu locație</p>
        <p>Deschide un proiect și apasă pe hartă pentru a seta locația.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[calc(100dvh-8rem)] w-full overflow-hidden rounded-2xl border border-[var(--color-line)]"
      />

      {/* Legendă */}
      <div className="absolute bottom-4 left-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-lg">
        <p className="mb-2 text-xs font-semibold text-ink-soft">Legendă</p>
        <div className="flex flex-col gap-1.5">
          {Object.entries(STATUS_RO).map(([k, label]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: STATUS_COLOR[k] ?? "#9ca3af" }} />
              <span className="text-xs">{label}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-2 border-t border-[var(--color-line)] pt-1.5">
            <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white">N</span>
            <span className="text-xs text-ink-soft">Grup de proiecte</span>
          </div>
        </div>
      </div>

      {/* Contor */}
      <div className="absolute right-4 top-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 shadow-lg">
        <span className="text-sm font-semibold">{pins.length}</span>
        <span className="ml-1 text-xs text-ink-soft">proiecte pe hartă</span>
      </div>
    </div>
  );
}
