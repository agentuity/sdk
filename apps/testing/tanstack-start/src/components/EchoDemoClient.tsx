import { useState } from 'react';
import { useAPI, AgentuityProvider } from '@agentuity/react';
import '@agentuity/routes';

function EchoDemoInner() {
   const [message, setMessage] = useState('Hello from TanStack Start!');
   const { data, invoke, isLoading, error } = useAPI('POST /api/echo');

   return (
      <div className="p-6 bg-white rounded-lg shadow-md max-w-md mx-auto">
         <h2 className="text-xl font-bold mb-4 text-gray-800">Echo Demo</h2>
         <p className="text-sm text-gray-600 mb-4">
            This demonstrates type-safe API calls from TanStack Start to Agentuity backend.
         </p>

         <div className="space-y-4">
            <div>
               <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                  Message
               </label>
               <input
                  id="message"
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter a message..."
               />
            </div>

            <button
               onClick={() => invoke({ message })}
               disabled={isLoading || !message.trim()}
               className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
               {isLoading ? 'Sending...' : 'Send Echo'}
            </button>

            {error && (
               <div className="p-3 bg-red-100 border border-red-300 rounded-md">
                  <p className="text-red-700 text-sm">Error: {error.message}</p>
               </div>
            )}

            {data && (
               <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                  <h3 className="font-semibold text-green-800 mb-2">Response:</h3>
                  <p className="text-green-700">
                     <span className="font-medium">Echo:</span> {data.echo}
                  </p>
                  <p className="text-green-600 text-sm mt-1">
                     <span className="font-medium">Timestamp:</span> {data.timestamp}
                  </p>
               </div>
            )}
         </div>
      </div>
   );
}

export default function EchoDemoClient() {
   return (
      <AgentuityProvider>
         <EchoDemoInner />
      </AgentuityProvider>
   );
}
