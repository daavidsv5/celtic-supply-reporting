import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import { auth } from '@/auth';

export const runtime = 'nodejs';

export async function POST() {
  const session = await auth();
  if (!session?.user || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // On Vercel: trigger a new deployment via Deploy Hook (read-only filesystem, no git)
  const deployHookUrl = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (deployHookUrl) {
    const res = await fetch(deployHookUrl, { method: 'POST' });
    if (res.ok) {
      return NextResponse.json({ ok: true, log: 'Vercel deploy triggered — nová data budou k dispozici za ~1 minutu.' });
    }
    return NextResponse.json({ ok: false, log: 'Deploy hook selhal.' }, { status: 500 });
  }

  // Check if running on Vercel (read-only filesystem — exec won't work)
  if (process.env.VERCEL) {
    return NextResponse.json({
      ok: false,
      log: 'Na Vercelu není nastaven VERCEL_DEPLOY_HOOK_URL. Přidej ho v Settings → Environment Variables.',
    }, { status: 500 });
  }

  // Locally: run the update script directly
  const scriptDir = path.join(process.cwd(), 'scripts');
  return new Promise<NextResponse>((resolve) => {
    exec('node updateData.js', { cwd: scriptDir }, (err, stdout, stderr) => {
      if (!err) {
        resolve(NextResponse.json({ ok: true, log: stdout }));
      } else {
        resolve(NextResponse.json({ ok: false, log: stderr || stdout }, { status: 500 }));
      }
    });
  });
}
