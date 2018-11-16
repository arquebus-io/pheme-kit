import { IStorage } from '@dcntrlzd/pheme/src';
import * as URL from 'url';
import IPFS from 'ipfs-api';
import axios from 'axios';

export interface IDAGNode {
  data: Buffer;
  links: any[];
  multihash: number[];
};

export interface IIPFSFileReference {
  path: string,
  hash: string,
  size: number,
};

export interface IIPFSFileResponse {
  path: string,
  content: Buffer,
}

export interface IIPFSClient {
  swarm: {
    peers: (opts?: { verbose: boolean }) => Promise<{
      addr: any /* MultiAddr */,
      peer: string /* PeerId */,
      muxer: string,
      latency?: string,
      streams?: string[]
    }[]>,
  },
  pin: {
    add: (hash: string, options?: any) => Promise<void>,
    ls: (hash?: string, options?: any) => Promise<{ hash: string, type: string }[]>,
    rm: (hash, options?: any) => Promise<void>,
  },
  files: {
    add: (object: Buffer, options?: any) => Promise<IIPFSFileReference[]>,
    get: (ipfsPath: string) => Promise<IIPFSFileResponse[]>,
  }
};

export const hashFromUrl = (url: string) => (url.match(/([a-zA-Z0-9]+):\/\/([a-zA-Z0-9]+)/) || [])[2] || '';

export default class PhemeStorageIPFS implements IStorage {
  readonly ipfs: IIPFSClient;
  readonly gatewayUrl: string;

  constructor(rpcUrl: string, gatewayUrl: string) {
    const uri = URL.parse(rpcUrl);

    this.gatewayUrl = gatewayUrl;
    this.ipfs = IPFS(uri.hostname, uri.port || '5001', {
      protocol: (uri.protocol || 'http').replace(/\:$/, ''),
    }) as IIPFSClient;
  }

  public addressForEstimation = () => 'ipfs://qmv8ndh7ageh9b24zngaextmuhj7aiuw3scc8hkczvjkww';

  public serialize(input: any) {
    return JSON.stringify(input);
  }

  public deserialize(input: string) {
    return JSON.parse(input);
  }

  public publicUrlFor(address: string) {
    if (!address) return '';

    const ipfsHash = hashFromUrl(address);
    return ipfsHash ? `${this.gatewayUrl}/ipfs/${ipfsHash}` : '';
  }

  async readData(address: string) {
    const { data } = await axios.get(this.publicUrlFor(address), { responseType: 'arraybuffer' });
    return Buffer.from(data);
  }

  async writeData(data: Buffer) {
    const [{ hash }] = await this.ipfs.files.add(data);
    return `ipfs://${hash}`;
  }

  async readObject(address: string): Promise<any> {
    return this.deserialize((await this.readData(address)).toString());
  }

  async writeObject(object: any): Promise<string> {
    return this.writeData(new Buffer(this.serialize(object)));
  }
}