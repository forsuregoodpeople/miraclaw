"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MikrotikRouter, MikrotikApi } from "@/lib/api/mikrotik";
import { useAuth } from "@/context/AuthContext";
import { SweetAlert } from "@/lib/sweetalert";
import { FiTerminal, FiPlay, FiTrash2, FiArrowLeft, FiLoader, FiWifi, FiWifiOff, FiPower, FiCopy } from "react-icons/fi";

interface CommandResult {
  command: string;
  success: boolean;
  output?: string[];
  error?: string;
}

interface TerminalResponse {
  router_id: number;
  commands: string[];
  results: CommandResult[];
  duration: number;
  success: boolean;
  error?: string;
}

// Fungsi untuk memformat output RouterOS agar lebih mudah dibaca
function formatRouterOSOutput(line: string): React.ReactNode {
  if (!line.trim()) {
    return <span className="text-gray-500">&nbsp;</span>;
  }

  // Jika line mengandung pasangan key=value, format dengan warna
  const keyValuePairs = line.trim().split(' ');
  if (keyValuePairs.length > 1 && keyValuePairs.some(pair => pair.includes('='))) {
    return (
      <span>
        {keyValuePairs.map((pair, index) => {
          const [key, value] = pair.split('=');
          if (key && value !== undefined) {
            return (
              <span key={index}>
                <span className="text-blue-400">{key}</span>
                <span className="text-gray-400">=</span>
                <span className="text-yellow-300">{value}</span>
                {index < keyValuePairs.length - 1 && <span className="text-gray-600"> </span>}
              </span>
            );
          } else {
            return <span key={index} className="text-gray-400">{pair}</span>;
          }
        })}
      </span>
    );
  }

  // Jika ini adalah judul atau header, tampilkan dengan warna berbeda
  if (line.includes('Flags:') || line.includes('interface') || line.includes('address') || line.includes('name')) {
    return <span className="text-cyan-400 font-semibold">{line}</span>;
  }

  // Default formatting
  return <span>{line}</span>;
}

function TerminalPageContent() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const routerId = searchParams.get("routerId");
  
  const [selectedRouter, setSelectedRouter] = useState<MikrotikRouter | null>(null);
  const [command, setCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [results, setResults] = useState<TerminalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const canCRUD = user?.role === "mitra" || user?.role === "superadmin";

  useEffect(() => {
    if (routerId) {
      fetchRouter();
    }
  }, [routerId]);

  const fetchRouter = async () => {
    if (!routerId) return;
    
    try {
      const data = await MikrotikApi.findAll();
      const foundRouter = data.find(r => r.id === parseInt(routerId));
      if (foundRouter) {
        setSelectedRouter(foundRouter);
      } else {
        SweetAlert.error("Error", "Router tidak ditemukan");
        router.push('/mikrotik');
      }
    } catch (error) {
      // Failed to fetch router
      SweetAlert.error("Error", "Gagal memuat data router");
      router.push('/mikrotik');
    }
  };

  const updateRouterStatus = (status?: string, isActive?: boolean) => {
    if (!selectedRouter) return;
    
    setSelectedRouter(prev => {
      if (!prev) return null;
      
      return {
        ...prev,
        ...(status && { status }),
        ...(isActive !== undefined && { is_active: isActive })
      };
    });
  };

  const copyOutput = (output: string[]) => {
    const text = output.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      SweetAlert.fire({
        icon: 'success',
        title: 'Disalin!',
        text: 'Output telah disalin ke clipboard',
        timer: 1500,
        showConfirmButton: false
      });
    }).catch(() => {
      SweetAlert.fire({
        icon: 'error',
        title: 'Gagal',
        text: 'Gagal menyalin output',
        timer: 1500,
        showConfirmButton: false
      });
    });
  };

  const handleExecuteCommand = async () => {
    if (!selectedRouter || !command.trim()) {
      SweetAlert.error("Error", "Pilih router dan masukkan perintah");
      return;
    }

    // Cek permission
    if (!canCRUD) {
      SweetAlert.error("Error", "Anda tidak memiliki izin untuk menjalankan perintah terminal");
      return;
    }

    // User permission check

    // Cek apakah router aktif
    if (!selectedRouter.is_active) {
      SweetAlert.error("Error", "Router tidak aktif. Silakan aktifkan router terlebih dahulu.");
      return;
    }

    setLoading(true);
    try {
      const requestData = {
        router_id: selectedRouter.id,
        commands: [command.trim()],
        timeout: 30 // 30 seconds
      };
      
      // Executing command

      const response = await MikrotikApi.executeTerminalCommand(requestData);

      // Command response received

      setResults(response as TerminalResponse);
      setCommandHistory(prev => [...prev, command.trim()]);
      setCommand("");
    } catch (error: any) {
      // Error executing command
      
      // Tampilkan error detail
      let errorMessage = "Gagal menjalankan perintah";
      if (error.response) {
        // Error response from server
        errorMessage = error.response.data?.message || error.response.data?.error || errorMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }

      SweetAlert.fire({
        icon: "error",
        title: "Error",
        html: `
          <div class="text-left">
            <p><strong>Perintah:</strong> ${command.trim()}</p>
            <p><strong>Router:</strong> ${selectedRouter.name}</p>
            <p><strong>Error:</strong> ${errorMessage}</p>
          </div>
        `,
        timer: 5000,
        timerProgressBar: true,
        showConfirmButton: true
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearResults = () => {
    setResults(null);
  };

  const handleBack = () => {
    router.push("/mikrotik");
  };

  const handlePing = async () => {
    if (!selectedRouter) return;

    setPinging(true);
    try {
      const result = await MikrotikApi.pingRouter(selectedRouter.id);
      if (result.success) {
        SweetAlert.fire({
          icon: "success",
          title: "Ping Berhasil",
          html: `
            <div class="text-left">
              <p><strong>Router:</strong> ${selectedRouter.name}</p>
              <p><strong>Status:</strong> <span class="text-green-600">✓ Reachable</span></p>
              <p><strong>Latency:</strong> ${result.latency_ms.toFixed(2)} ms</p>
            </div>
          `,
          timer: 5000,
          timerProgressBar: true,
          showConfirmButton: false,
        });
        // Update status to up if ping successful
        await MikrotikApi.updateRouterStatus(selectedRouter.id, "up");
        updateRouterStatus("up");
      } else {
        SweetAlert.fire({
          icon: "error",
          title: "Ping Gagal",
          html: `
            <div class="text-left">
              <p><strong>Router:</strong> ${selectedRouter.name}</p>
              <p><strong>Status:</strong> <span class="text-red-600">✗ Unreachable</span></p>
              <p><strong>Error:</strong> ${result.error || "Unknown error"}</p>
              <p><strong>Test Time:</strong> ${new Date(result.timestamp).toLocaleTimeString()}</p>
            </div>
          `,
          timer: 5000,
          timerProgressBar: true,
          showConfirmButton: false,
        });
        // Update status to down if ping failed
        await MikrotikApi.updateRouterStatus(selectedRouter.id, "down");
        updateRouterStatus("down");
      }
    } catch (error) {
      // Error pinging router
      SweetAlert.fire({
        icon: "error",
        title: "Error",
        text: "Gagal melakukan ping ke router",
        timer: 3000,
        timerProgressBar: true,
        showConfirmButton: false,
      });
    } finally {
      setPinging(false);
    }
  };

  const handleToggleActive = async () => {
    if (!selectedRouter) return;

    const action = selectedRouter.is_active ? "menonaktifkan" : "mengaktifkan";
    const result = await SweetAlert.confirm(
      `${action === "mengaktifkan" ? "Aktifkan" : "Nonaktifkan"} Router`,
      `Apakah Anda yakin ingin ${action} router "${selectedRouter.name}"?`
    );

    if (result.isConfirmed) {
      setTogglingActive(true);
      try {
        await MikrotikApi.toggleRouterActive(selectedRouter.id);
        SweetAlert.success("Berhasil", `Router berhasil ${action}`);
        // Update selected router state
        updateRouterStatus(undefined, !selectedRouter.is_active);
      } catch (error) {
        // Error toggling router active state
        SweetAlert.error("Error", `Gagal ${action} router`);
      } finally {
        setTogglingActive(false);
      }
    }
  };

  if (!selectedRouter) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800 dark:border-gray-700 dark:border-t-white/90" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="rounded-lg bg-gray-500 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700"
          >
            <FiArrowLeft className="mr-2 inline" />
            Kembali
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">
              Terminal - {selectedRouter.name}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {selectedRouter.host}:{selectedRouter.port}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePing}
            disabled={pinging}
            className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:bg-gray-400 dark:bg-blue-600 dark:hover:bg-blue-700 dark:disabled:bg-gray-600"
          >
            {pinging ? (
              <FiLoader className="h-4 w-4 animate-spin inline mr-2" />
            ) : selectedRouter.status === "up" ? (
              <FiWifi className="h-4 w-4 inline mr-2" />
            ) : (
              <FiWifiOff className="h-4 w-4 inline mr-2" />
            )}
            Ping
          </button>

          {canCRUD && (
            <button
              onClick={handleToggleActive}
              disabled={togglingActive}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:bg-gray-400 dark:disabled:bg-gray-600 ${
                selectedRouter.is_active
                  ? "bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                  : "bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
              }`}
            >
              {togglingActive ? (
                <FiLoader className="h-4 w-4 animate-spin inline mr-2" />
              ) : (
                <FiPower className="h-4 w-4 inline mr-2" />
              )}
              {selectedRouter.is_active ? "Nonaktifkan" : "Aktifkan"}
            </button>
          )}
        </div>
      </div>

      {/* Router Status Card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
            <p className="mt-1 text-lg font-semibold">
              <span
                className={`inline-flex items-center gap-1 ${
                  selectedRouter.status === "up"
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {selectedRouter.status === "up" ? <FiWifi /> : <FiWifiOff />}
                {selectedRouter.status || "unknown"}
              </span>
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Active</p>
            <p className="mt-1 text-lg font-semibold">
              <span
                className={`${
                  selectedRouter.is_active
                    ? "text-green-600 dark:text-green-400"
                    : "text-gray-600 dark:text-gray-400"
                }`}
              >
                {selectedRouter.is_active ? "Yes" : "No"}
              </span>
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Username</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {selectedRouter.username}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Coordinates</p>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {selectedRouter.latitude && selectedRouter.longitude ? (
                <span className="text-blue-600">
                  📍 {selectedRouter.latitude.toFixed(4)}, {selectedRouter.longitude.toFixed(4)}
                </span>
              ) : (
                <span className="text-gray-400">Not set</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Command Input */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 mb-4">
          <FiTerminal className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Terminal Perintah
          </h2>
        </div>

        <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Wajib terdapat / (contoh: /system/resource/print)
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter" && !loading && command.trim()) {
                  handleExecuteCommand();
                }
              }}
              placeholder="Masukkan perintah MikroTik (contoh: /system/resource/print)"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
              disabled={loading || !selectedRouter.is_active}
            />
          </div>
          <button
            onClick={handleExecuteCommand}
            disabled={loading || !command.trim()}
            className="flex items-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:bg-gray-400 dark:bg-brand-600 dark:hover:bg-brand-700 dark:disabled:bg-gray-600 transition-all duration-200 disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span className="ml-2">Eksekusi...</span>
              </div>
            ) : (
              <>
                <FiPlay className="h-4 w-4" />
                <span className="ml-2">Jalankan</span>
              </>
            )}
          </button>
        </div>
        
        {/* Command History */}
        {commandHistory.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Riwayat Perintah:
            </h3>
            <div className="flex flex-wrap gap-2">
              {commandHistory.map((cmd, index) => (
                <button
                  key={index}
                  onClick={() => setCommand(cmd)}
                  className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Commands */}
        <div className="mt-4 space-y-4">
          {/* System Commands */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              🔧 System:
            </h3>
            <div className="flex flex-wrap gap-2">
              {[
                "/system/resource/print",
                "/system/identity/print", 
                "/system/routerboard/print",
                "/system/clock/print"
              ].map((cmd, index) => (
                <button
                  key={index}
                  onClick={() => setCommand(cmd)}
                  className="rounded bg-blue-100 px-3 py-1 text-xs text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>

          {/* Network Commands */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              🌐 Network:
            </h3>
            <div className="flex flex-wrap gap-2">
              {[
                "/interface/print", 
                "/ip/address/print",
                "/ip/route/print",
                "/ip/dhcp-server/lease/print"
              ].map((cmd, index) => (
                <button
                  key={index}
                  onClick={() => setCommand(cmd)}
                  className="rounded bg-green-100 px-3 py-1 text-xs text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/50"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>

          {/* Firewall & Security */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Firewall & Security:
            </h3>
            <div className="flex flex-wrap gap-2">
              {[
                "/ip/firewall/filter/print",
                "/ip/firewall/nat/print",
                "/user/active/print",
                "/user/print"
              ].map((cmd, index) => (
                <button
                  key={index}
                  onClick={() => setCommand(cmd)}
                  className="rounded bg-red-100 px-3 py-1 text-xs text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>

          {/* Monitoring */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              📊 Monitoring:
            </h3>
            <div className="flex flex-wrap gap-2">
              {[
                "/queue/simple/print",
                "/interface/monitor-traffic",
                "/tool/ping",
                "/tool/traceroute"
              ].map((cmd, index) => (
                <button
                  key={index}
                  onClick={() => setCommand(cmd)}
                  className="rounded bg-purple-100 px-3 py-1 text-xs text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                Hasil Eksekusi
              </h2>
              <div className="flex items-center gap-4 mt-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  results.success 
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                }`}>
                  {results.success ? "✓ Berhasil" : "✗ Gagal"}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {(results.duration / 1000).toFixed(2)}s
                </span>
              </div>
            </div>
            <button
              onClick={handleClearResults}
              className="flex items-center rounded-lg bg-gray-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 transition-colors"
            >
              <FiTrash2 className="mr-1 inline" />
              Hapus
            </button>
          </div>

          <div className="space-y-4">
            {results.results.map((result, index) => (
              <div
                key={index}
                className={`rounded-lg border p-4 ${
                  result.success
                    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                    : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-mono text-sm font-medium text-gray-900 dark:text-white/90">
                    {result.command}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      result.success
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                    }`}
                  >
                    {result.success ? "Sukses" : "Error"}
                  </span>
                </div>
                
                {result.error && (
                  <div className="mt-2">
                    <div className="bg-red-900 text-red-100 p-3 rounded-lg font-mono text-sm">
                      <div className="flex items-center mb-2 pb-2 border-b border-red-700">
                        <span className="text-red-300 text-xs mr-2">❌ ERROR</span>
                        <span className="text-red-400 text-xs font-medium">{result.error}</span>
                      </div>
                    </div>
                  </div>
                )}
                
                {!result.error && (!result.output || result.output.length === 0) && (
                  <div className="mt-2">
                    <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                      <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
                        📭 Tidak ada output yang ditampilkan
                      </div>
                    </div>
                  </div>
                )}
                
                {result.output && result.output.length > 0 && (
                  <div className="mt-2">
                    <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm overflow-x-auto shadow-lg">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
                        <div className="flex items-center gap-2">
                          <span className="text-green-300 text-xs">📋 OUTPUT</span>
                          <span className="text-gray-400 text-xs">{result.output.length} baris</span>
                        </div>
                        <button
                          onClick={() => copyOutput(result.output!)}
                          className="text-gray-400 hover:text-white transition-colors p-1 rounded"
                          title="Salin output"
                        >
                          <FiCopy className="w-3 h-3" />
                        </button>
                      </div>
                      
                      {/* Output content */}
                      <div className="space-y-1">
                        {result.output.map((line, lineIndex) => (
                          <div 
                            key={lineIndex} 
                            className="group hover:bg-gray-800 px-3 py-1.5 rounded transition-colors duration-150"
                          >
                            <div className="flex items-start">
                              <span className="text-gray-500 text-xs mr-3 mt-0.5 min-w-[2rem] text-right">
                                {lineIndex + 1}
                              </span>
                              <div className="flex-1">
                                {formatRouterOSOutput(line)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TerminalPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800 dark:border-gray-700 dark:border-t-white/90" />
      </div>
    }>
      <TerminalPageContent />
    </Suspense>
  );
}