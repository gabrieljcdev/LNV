import { Link } from 'react-router-dom';

export default function PageNotFound() {
  return (
    <div className="px-4 py-16 text-center space-y-4">
      <p className="text-amber-bright text-2xl tracking-widest">ERROR 404</p>
      <p className="text-amber-muted text-lg">FILE NOT FOUND</p>
      <p className="text-amber-dim">This path does not exist in the directory.</p>
      <Link to="/" className="block mt-4 text-amber-orange hover:text-amber-bright tracking-widest">
        &gt; RETURN TO ROOT\
      </Link>
    </div>
  );
}