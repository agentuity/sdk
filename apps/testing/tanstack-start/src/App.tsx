import logo from './logo.svg';
import { EchoDemo } from './components/EchoDemo';

function App() {
   return (
      <div className="min-h-screen bg-[#282c34]">
         <header className="flex flex-col items-center justify-center py-12 text-white">
            <img
               src={logo}
               className="h-24 pointer-events-none animate-[spin_20s_linear_infinite]"
               alt="logo"
            />
            <h1 className="text-2xl font-bold mt-4">TanStack Start + Agentuity</h1>
            <p className="text-gray-400 mt-2">
               React SPA with type-safe Agentuity backend integration
            </p>
         </header>

         <main className="pb-12">
            <EchoDemo />
         </main>

         <footer className="text-center py-8 text-gray-500 text-sm">
            <div className="flex justify-center gap-6">
               <a
                  className="text-[#61dafb] hover:underline"
                  href="https://reactjs.org"
                  target="_blank"
                  rel="noopener noreferrer"
               >
                  Learn React
               </a>
               <a
                  className="text-[#61dafb] hover:underline"
                  href="https://tanstack.com"
                  target="_blank"
                  rel="noopener noreferrer"
               >
                  Learn TanStack
               </a>
               <a
                  className="text-[#61dafb] hover:underline"
                  href="https://agentuity.dev"
                  target="_blank"
                  rel="noopener noreferrer"
               >
                  Agentuity Docs
               </a>
            </div>
         </footer>
      </div>
   );
}

export default App;
