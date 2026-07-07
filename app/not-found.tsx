import Link from "next/link";
import { QuillIcon } from "@/components/QuillIcon";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50 px-4">
      <div className="bg-white rounded-2xl shadow-md border border-amber-100 px-10 pt-10 pb-10 w-full max-w-sm text-center">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-amber-50 rounded-2xl p-4 mb-4 shadow-inner border border-amber-100">
            <QuillIcon className="w-16 h-16" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 font-display">
            Blank page
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            There's nothing written here. The page you're looking for doesn't exist.
          </p>
        </div>

        <Link
          href="/feed"
          className="block w-full bg-amber-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-800 transition-colors"
        >
          Back to the feed
        </Link>
      </div>
    </div>
  );
}
