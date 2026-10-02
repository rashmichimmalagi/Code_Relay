import { Link } from "react-router-dom";
 
export default function AdminDashboardPage() { 
  return ( 
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white"> 
      <div className="mx-auto max-w-6xl"> 
 
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl"> 
 
          {/* HEADER */} 
          <div className="flex flex-wrap items-start justify-between gap-4"> 
            <div> 
              <p className="text-sm font-medium text-cyan-400"> 
                CodeRelay Administration 
              </p> 
 
              <h1 className="mt-2 text-3xl font-bold"> 
                Admin Dashboard 
              </h1> 
 
              <p className="mt-3 text-slate-400"> 
                Manage teams and control CodeRelay 
                competition rounds. 
              </p> 
            </div> 
 
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3"> 
              <p className="text-sm font-semibold text-emerald-400"> 
                Administrator 
              </p> 
            </div> 
          </div> 
 
          {/* QUICK STATUS */} 
          <div className="mt-8 grid gap-4 md:grid-cols-3"> 
 
            <div className="rounded-xl border border-white/10 bg-black/20 p-5"> 
              <p className="text-sm text-slate-400"> 
                Authentication 
              </p> 
 
              <p className="mt-2 text-lg font-semibold text-emerald-300"> 
                Active 
              </p> 
            </div> 
 
            <div className="rounded-xl border border-white/10 bg-black/20 p-5"> 
              <p className="text-sm text-slate-400"> 
                Admin Access 
              </p> 
 
              <p className="mt-2 text-lg font-semibold text-emerald-300"> 
                Authorized 
              </p> 
            </div> 
 
            <div className="rounded-xl border border-white/10 bg-black/20 p-5"> 
              <p className="text-sm text-slate-400"> 
                Platform 
              </p> 
 
              <p className="mt-2 text-lg font-semibold"> 
                CodeRelay 
              </p> 
            </div> 
          </div> 
 
          {/* CONTROLS */} 
          <div className="mt-8 grid gap-4 md:grid-cols-2"> 
 
            {/* TEAM MANAGEMENT */} 
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-6"> 
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400"> 
                Team Administration 
              </p> 
 
              <h2 className="mt-2 text-xl font-semibold"> 
                Team Management 
              </h2> 
 
              <p className="mt-2 text-sm leading-6 text-slate-400"> 
                Review pending registrations, 
                approve or reject teams, and 
                deapprove approved teams when 
                you need to correct their team 
                number. 
              </p> 
 
              <Link 
                to="/admin/teams" 
                className="mt-5 inline-flex rounded-lg bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-300" 
              > 
                Open Team Management 
              </Link> 
            </div> 
 
            {/* ROUND 2 */} 
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-6"> 
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400"> 
                Competition Control 
              </p> 
 
              <h2 className="mt-2 text-xl font-semibold"> 
                Round 2 Control 
              </h2> 
 
              <p className="mt-2 text-sm leading-6 text-slate-400"> 
                Manage Round 2 questions, 
                interfaces, visible tests, 
                relay phases, timer and 
                question assignment. 
              </p> 
 
              <Link 
                to="/admin/round2" 
                className="mt-5 inline-flex rounded-lg bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300" 
              > 
                Open Round 2 Control 
              </Link> 
            </div> 
 
          </div> 
        </div> 
      </div> 
    </main> 
  ); 
}
