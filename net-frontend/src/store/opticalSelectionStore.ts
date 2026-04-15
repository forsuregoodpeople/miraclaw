import { create } from 'zustand';
import type { GenieACSDevice, ODPSummary } from '@/types/optical.types';

interface OpticalSelectionState {
  selectedDevice: GenieACSDevice | null;
  selectedODP: ODPSummary | null;
  setSelectedDevice: (d: GenieACSDevice | null) => void;
  setSelectedODP: (o: ODPSummary | null) => void;
  clearSelection: () => void;
}

export const useOpticalSelectionStore = create<OpticalSelectionState>((set) => ({
  selectedDevice: null,
  selectedODP: null,
  setSelectedDevice: (d) => set({ selectedDevice: d }),
  setSelectedODP: (o) => set({ selectedODP: o }),
  clearSelection: () => set({ selectedDevice: null, selectedODP: null }),
}));
