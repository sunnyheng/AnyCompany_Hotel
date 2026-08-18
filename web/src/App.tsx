import { config } from './config';

export default function App() {
  return (
    <div className="signin-wrap">
      <div className="signin-card">
        <h1>ANYCOMPANY</h1>
        <p className="tagline">Hotels &amp; Resorts — step-up auth demo ({config.mode} mode)</p>
      </div>
    </div>
  );
}
