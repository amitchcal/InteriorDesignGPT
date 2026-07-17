import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  /**
   * pdfkit reads its font metrics from disk relative to its own __dirname.
   * Bundling rewrites that to a synthetic path, so it fails at runtime with
   *   ENOENT: open 'C:\ROOT\node_modules\pdfkit\js\data\Helvetica.afm'
   * even though nothing is wrong with the code. Keeping it external leaves it
   * as a real node_modules require, which is what its file access assumes.
   * Applies to the deployed build too — this is not a dev-only workaround.
   */
  serverExternalPackages: ["pdfkit"],
};

export default withNextIntl(nextConfig);
