import { Web3Storage, File } from 'web3.storage';

const token = process.env.WEB3_STORAGE_TOKEN || '';

if (!token) {
    console.error('WEB3_STORAGE_TOKEN is not defined in environment variables');
    throw new Error('WEB3_STORAGE_TOKEN is not defined in environment variables');
}

const client = new Web3Storage({ token });

export async function uploadToIPFS(data: string): Promise<string> {
    const file = new File([data], 'prescription.txt', { type: 'text/plain' });
    const cid = await client.put([file]);
    return cid;
}
