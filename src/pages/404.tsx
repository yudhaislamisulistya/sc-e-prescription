import Link from "next/link";
import Head from "next/head";
import { useT } from "@/i18n/I18nProvider";

export default function NotFound() {
  const t = useT();
  return (
    <>
      <Head>
        <title>{t("notFound.pageTitle")} · e-Prescription</title>
      </Head>
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-5 text-center">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal text-white font-mono text-lg font-bold">
          ℞
        </span>
        <p className="eyebrow mt-6">{t("notFound.eyebrow")}</p>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">{t("notFound.title")}</h1>
        <p className="text-muted mt-3 max-w-sm">
          {t("notFound.body")}
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex h-11 items-center rounded-lg bg-teal px-5 text-white font-medium hover:bg-teal-deep transition-colors"
        >
          {t("notFound.buttons.home")}
        </Link>
      </div>
    </>
  );
}
