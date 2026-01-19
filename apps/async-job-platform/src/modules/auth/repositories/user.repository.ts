import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial, FindOptionsWhere } from 'typeorm';
import { User } from '@app/common';
import { IUserRepository } from './user.repository.interface';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  create(data: DeepPartial<User>): User {
    return this.repository.create(data);
  }

  async save(entity: User): Promise<User> {
    return this.repository.save(entity);
  }

  async findById(id: string): Promise<User | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.repository.findOne({ where: { phone } });
  }

  async findOne(where: FindOptionsWhere<User>): Promise<User | null> {
    return this.repository.findOne({ where });
  }

  async update(id: string, data: DeepPartial<User>): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) return null;
    Object.assign(user, data);
    return this.save(user);
  }

  async updatePhoneVerified(userId: string, verified: boolean): Promise<void> {
    await this.repository.update(userId, { phoneVerified: verified });
  }

  async deactivate(userId: string): Promise<void> {
    await this.repository.update(userId, { isActive: false });
  }

  async activate(userId: string): Promise<void> {
    await this.repository.update(userId, { isActive: true });
  }
}
