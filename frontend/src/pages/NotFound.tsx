import { Link } from 'react-router-dom';

/** Bare by design: no shell, navigation, footer or background. */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-6 text-center">
      <div>
        <h1 className="text-[40px] tracking-[-0.03em] text-head md:text-[56px]">Not Found</h1>
        <Link to="/" className="pill mt-8 inline-flex">Go to Home</Link>
      </div>
    </main>
  );
}
