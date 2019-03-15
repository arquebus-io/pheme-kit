import * as ethers from 'ethers';
import { modifyTask, createTask, IRegistry, ITask } from '../index';
import RegistryAbi from '@pheme-kit/ethereum/artifacts/abi/RegistryV1.json';

type Contract = any;
type ContractMethodCall = any;

export default class PhemeRegistry implements IRegistry {
  public static attach(
    address: string,
    providerOrSigner: ethers.providers.Provider | ethers.ethers.Signer
  ): PhemeRegistry {
    const contract = new ethers.Contract(address, RegistryAbi, providerOrSigner);
    return new PhemeRegistry(contract);
  }
  private static stringToBytes(input: string): string {
    return ethers.utils.formatBytes32String(input);
  }

  private static bytesToString(input: string): string {
    return ethers.utils.parseBytes32String(input);
  }

  public contract: ethers.Contract;

  constructor(contract: ethers.Contract) {
    this.contract = contract;
  }

  public register(handle: string): ITask {
    return this.buildSetterTask('registerHandle', [PhemeRegistry.stringToBytes(handle)]);
  }

  public getPointer(handle: string): ITask<string> {
    return this.buildGetterTask('getHandlePointer', [PhemeRegistry.stringToBytes(handle)]);
  }

  public setPointer(handle: string, value: string = ''): ITask {
    return this.buildSetterTask('setHandlePointer', [PhemeRegistry.stringToBytes(handle), value]);
  }

  public getProfile(handle: string): ITask<string> {
    return this.buildGetterTask('getHandleProfile', [PhemeRegistry.stringToBytes(handle)]);
  }

  public setProfile(handle: string, value: string = ''): ITask {
    return this.buildSetterTask('setHandleProfile', [PhemeRegistry.stringToBytes(handle), value]);
  }

  public getOwner(handle: string): ITask<string> {
    return this.buildGetterTask('getHandleOwner', [PhemeRegistry.stringToBytes(handle)]);
  }

  public setOwner(handle: string, value: string = ''): ITask {
    return this.buildSetterTask('setHandleOwner', [PhemeRegistry.stringToBytes(handle), value]);
  }

  public getHandleAt(index: number): ITask<string> {
    const task = this.buildGetterTask('getHandleAt', [index]);

    return modifyTask(task, {
      execute: () =>
        task.execute().then((handleAsBytes: string) => PhemeRegistry.bytesToString(handleAsBytes)),
    });
  }

  public getHandleCount(): ITask<number> {
    return this.buildGetterTask('getHandleCount');
  }

  public getHandleByOwner(owner: string): ITask<string> {
    const task = this.buildGetterTask('getHandleByOwner', [owner]);

    return modifyTask(task, {
      execute: () =>
        task.execute().then((handleAsBytes: string) => PhemeRegistry.bytesToString(handleAsBytes)),
    });
  }

  private buildGetterTask<T>(methodName: string, args: any[] = [], options: any = {}): ITask<T> {
    return createTask(
      {
        estimate: () => Promise.resolve(ethers.constants.Zero),
        execute: () => this.contract.functions[methodName](...args, options),
      },
      { txHash: '' }
    );
  }

  // TODO: make it abstract to convert calls to commands/tasks
  private buildSetterTask(methodName: string, args: any[] = [], options: any = {}): ITask<void> {
    let estimateGasPromise;
    let gasPricePromise;

    const getGasPrice = (): Promise<ethers.utils.BigNumber> => {
      if (!gasPricePromise) gasPricePromise = this.contract.provider.getGasPrice();
      return gasPricePromise;
    };

    const estimateGas = (): Promise<ethers.utils.BigNumber> => {
      if (!estimateGasPromise) {
        estimateGasPromise = this.contract.estimate[methodName](...args, options);
      }
      return estimateGasPromise;
    };

    return createTask(
      {
        estimate: (context) =>
          Promise.all([getGasPrice(), estimateGas()]).then(
            ([gasPrice, gasCost]: [ethers.utils.BigNumber, ethers.utils.BigNumber]) =>
              gasPrice.mul(gasCost)
          ),
        execute: (context) =>
          this.contract.functions[methodName](...args, options).then((tx) => {
            context.txHash = tx.hash;
            return;
          }),
      },
      { txHash: '' }
    );
  }
}
