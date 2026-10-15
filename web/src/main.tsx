import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "streamdown/styles.css";
import "./styles/globals.css";
import { RouterProvider } from "react-router-dom";

import { AppProviders } from "@/components/layout/app-providers";
import "@/i18n";
import { initAnalytics } from "@/lib/analytics";
import { migrateLegacyStorage } from "@/lib/localforage-storage";
import { router } from "@/router";

// 品牌改名后旧库名（infinite-canvas）里的画布与素材需要搬到新库（vs-studio）。
// 必须赶在 React 挂载、各 store 读取数据之前完成，否则首屏会读到空数据。
await migrateLegacyStorage();
initAnalytics();

document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppProviders>
            <RouterProvider router={router} />
        </AppProviders>
    </React.StrictMode>,
);
