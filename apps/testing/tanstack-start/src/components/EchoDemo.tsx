import { useState, useEffect, lazy, Suspense } from 'react';

const EchoDemoClient = lazy(() => import('./EchoDemoClient'));

export function EchoDemo() {
   const [isClient, setIsClient] = useState(false);

   useEffect(() => {
      setIsClient(true);
   }, []);

   if (!isClient) {
      return (
         <div className="p-4 bg-gray-100 rounded-lg">
            <p className="text-gray-500">Loading Echo Demo...</p>
         </div>
      );
   }

   return (
      <Suspense
         fallback={
            <div className="p-4 bg-gray-100 rounded-lg">
               <p className="text-gray-500">Loading Echo Demo...</p>
            </div>
         }
      >
         <EchoDemoClient />
      </Suspense>
   );
}
