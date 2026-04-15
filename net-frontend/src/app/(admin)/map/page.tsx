"use client";

import dynamic from "next/dynamic";

const MapDevice = dynamic(() => import("@/components/map/MapDevice"), { ssr: false });

export default function DeviceMapPage() {
  return (
    <div className="-m-4 md:-m-6 mt-0 h-[calc(100vh-4rem)]">
      <MapDevice />
    </div>
  );
}
