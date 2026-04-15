"use client";

import { useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix default icons in leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface LocationMapProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
  readOnly?: boolean;
}

function LocationMarker({ position, onChange, readOnly }: { position: L.LatLng | null, onChange: (lat: number, lng: number) => void, readOnly: boolean }) {
  const map = useMapEvents({
    click(e) {
      if (!readOnly) {
        onChange(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  useEffect(() => {
    if (position) {
      map.flyTo(position, map.getZoom());
    }
  }, [position, map]);

  return position === null ? null : (
    <Marker position={position} />
  );
}

export default function LocationMap({ latitude, longitude, onChange, readOnly = false }: LocationMapProps) {
  // Default to Indonesian midpoint if no lat/lng provided
  const [position, setPosition] = useState<L.LatLng | null>(
    latitude && longitude ? new L.LatLng(latitude, longitude) : null
  );

  useEffect(() => {
    if (latitude && longitude) {
      setPosition(new L.LatLng(latitude, longitude));
    }
  }, [latitude, longitude]);

  const handleLocationChange = (lat: number, lng: number) => {
    setPosition(new L.LatLng(lat, lng));
    onChange(lat, lng);
  };

  const center: L.LatLngTuple = position
    ? [position.lat, position.lng]
    : [-7.5459, 112.2333]; // Default Jombang

  return (
    <div className="h-full w-full relative z-0">
      <MapContainer center={center} zoom={position ? 15 : 5} scrollWheelZoom={true} className="h-full w-full rounded-lg relative z-0">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker position={position} onChange={handleLocationChange} readOnly={readOnly} />
      </MapContainer>
    </div>
  );
}
