import { DeepPartial, FindOptionsWhere } from 'typeorm';

export interface IBaseRepository<T> {
  create(data: DeepPartial<T>): T;
  save(entity: T): Promise<T>;
  saveMany(entities: T[]): Promise<T[]>;

  findById(id: string): Promise<T | null>;
  findOne(where: FindOptionsWhere<T>): Promise<T | null>;
  findAll(): Promise<T[]>;
  findBy(where: FindOptionsWhere<T>): Promise<T[]>;

  update(id: string, data: DeepPartial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;

  count(where?: FindOptionsWhere<T>): Promise<number>;
  exists(where: FindOptionsWhere<T>): Promise<boolean>;
}
