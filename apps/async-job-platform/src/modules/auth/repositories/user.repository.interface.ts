import { DeepPartial, FindOptionsWhere } from 'typeorm';
import { User } from '@app/common';

export abstract class IUserRepository {
  abstract create(data: DeepPartial<User>): User;
  abstract save(entity: User): Promise<User>;
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findOne(where: FindOptionsWhere<User>): Promise<User | null>;
  abstract update(id: string, data: DeepPartial<User>): Promise<User | null>;
  abstract deactivate(userId: string): Promise<void>;
  abstract activate(userId: string): Promise<void>;
}
