"use client";

import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for default markers in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface LocationPickerProps {
  latitude?: number | null;
  longitude?: number | null;
  onLocationChange: (lat: number, lng: number) => void;
  height?: string;
}

// Jombang default coordinates
const DEFAULT_LAT = -7.5463;
const DEFAULT_LNG = 112.2364;

function MapClickHandler({ onLocationChange }: { onLocationChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function LocationPicker({ 
  latitude, 
  longitude, 
  onLocationChange, 
  height = "300px" 
}: LocationPickerProps) {
  const [center, setCenter] = useState<[number, number]>([DEFAULT_LAT, DEFAULT_LNG]);
  const [markerPosition, setMarkerPosition] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (latitude && longitude) {
      const pos: [number, number] = [latitude, longitude];
      setCenter(pos);
      setMarkerPosition(pos);
    } else {
      setCenter([DEFAULT_LAT, DEFAULT_LNG]);
      setMarkerPosition(null);
    }
  }, [latitude, longitude]);

  return (
    <div className="w-full rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
      <MapContainer
        center={center}
        zoom={13}
        style={{ height, width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onLocationChange={onLocationChange} />
        {markerPosition && (
          <Marker position={markerPosition} />
        )}
      </MapContainer>
    </div>
  );
}