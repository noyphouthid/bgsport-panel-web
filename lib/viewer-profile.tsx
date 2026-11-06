"use client";

import { createContext, useContext } from "react";
import type { AppRole } from "@/lib/access-control";

export const ViewerProfileContext = createContext<{ id: string; role: AppRole } | null>(null);
export const useViewerProfile = () => useContext(ViewerProfileContext);
