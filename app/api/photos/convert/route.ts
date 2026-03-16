import { NextResponse } from 'next/server';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function convertWithSips(buffer: Buffer): Promise<Buffer> {
  // macOS built-in tool — handles all Apple HEIC formats natively
  const tempDir = await mkdtemp(join(tmpdir(), 'photo-'));
  const inputPath = join(tempDir, 'input.heic');
  const outputPath = join(tempDir, 'output.jpg');

  try {
    await writeFile(inputPath, buffer);
    await execFileAsync('sips', [
      '-s', 'format', 'jpeg',
      '-s', 'formatOptions', '75',
      '--resampleHeightWidthMax', '1200',
      inputPath,
      '--out', outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

async function convertWithSharp(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  return sharp(buffer)
    .rotate()
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let jpegBuffer: Buffer;
    try {
      // Try sharp first (works on Linux/Vercel with HEIC support)
      jpegBuffer = await convertWithSharp(buffer);
    } catch {
      // Fall back to sips (macOS built-in, handles all Apple HEIC formats)
      jpegBuffer = await convertWithSips(buffer);
    }

    return new NextResponse(new Uint8Array(jpegBuffer), {
      headers: {
        'Content-Type': 'image/jpeg',
      },
    });
  } catch (err) {
    console.error('Photo conversion failed:', err);
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
