import "@/styles/globals.css";
import "react-toastify/dist/ReactToastify.css";
import { ToastContainer } from "react-toastify";
import type { AppProps } from "next/app";
import Head from "next/head";
import { Geist, Geist_Mono } from "next/font/google";
import { I18nProvider } from "@/i18n/I18nProvider";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export default function App({ Component, pageProps }: AppProps) {
  return (
    <I18nProvider>
      <div className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        <Head>
          <title>e-Prescription</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta
            name="description"
            content="Smart-contract e-prescription system on a permissioned consortium blockchain: signed, encrypted, lifecycle-tracked prescriptions."
          />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <Component {...pageProps} />
        <ToastContainer
          position="bottom-right"
          autoClose={3500}
          hideProgressBar
          newestOnTop
          theme="light"
        />
      </div>
    </I18nProvider>
  );
}
