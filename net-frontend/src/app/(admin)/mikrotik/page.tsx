"use client";

import React from "react";
import { MikrotikTableComponent } from "@/components/mikrotik/perangkat/MikrotikTableComponent";

const MikrotikPage = () => {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Manajemen Router Mikrotik
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Kelola router Mikrotik untuk monitoring jaringan
        </p>
      </div>

      <MikrotikTableComponent />
    </div>
  );
};

export default MikrotikPage;
