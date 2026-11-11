import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="page">
      <div className="empty-state" style={{ paddingTop: 120 }}>
        <Compass size={34} />
        <h3>Page not found</h3>
        <p className="t-body-reduced">The page you are looking for does not exist.</p>
        <Link to="/" className="primary-btn mt-2">
          Go home
        </Link>
      </div>
    </div>
  );
}
