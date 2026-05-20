import Link from "next/link";
import { Button } from "@repo/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <main className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-4">
          AI Preprocessing Engine
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Turn messy data into ML-ready datasets in seconds with AI-powered preprocessing.
        </p>

        <div className="flex gap-4 justify-center">
          <Link href="/dashboard">
            <Button appName="preprocessing-engine">
              Go to Dashboard
            </Button>
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-3 gap-8 text-left">
          <div>
            <h3 className="font-semibold mb-2">Upload</h3>
            <p className="text-sm text-gray-600">
              Upload your messy CSV files and let AI analyze them.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Process</h3>
            <p className="text-sm text-gray-600">
              RL agent automatically selects the best preprocessing strategies.
            </p>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Download</h3>
            <p className="text-sm text-gray-600">
              Get clean, ML-ready datasets with full audit trails.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}