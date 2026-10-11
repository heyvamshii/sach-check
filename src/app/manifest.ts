import type { MetadataRoute } from "next";

/** Makes the site installable. `share_target` puts SachCheck in Android's Share menu, e.g. from WhatsApp. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SachCheck: WhatsApp forward fact-checker",
    short_name: "SachCheck",
    description: "Check WhatsApp forwards against trusted sources and spot edited images.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4efe6",
    theme_color: "#1a1714",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "media", accept: ["image/*"] }],
      },
    },
  };
}
