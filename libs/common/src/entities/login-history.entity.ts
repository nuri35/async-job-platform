import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { LoginStatus, LoginFailureReason } from '../enums';

@Entity('login_history')
@Index(['userId', 'loggedAt']) // Composite index for user history queries
export class LoginHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  userId: string | null; // Null if user not found (failed login with unknown email)

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null; // Store email even if user not found

  @Column({ type: 'timestamp' })
  @Index()
  loggedAt: Date;

  // Device Info
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  deviceFingerprint: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  deviceName: string | null;

  // GeoIP Info
  @Column({ type: 'varchar', length: 2, nullable: true })
  countryCode: string | null; // ISO 3166-1 alpha-2 (TR, US, DE)

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  // Result
  @Column({ type: 'enum', enum: LoginStatus })
  @Index()
  status: LoginStatus;

  @Column({ type: 'enum', enum: LoginFailureReason, nullable: true })
  failureReason: LoginFailureReason | null;

  // Session link (only for successful logins)
  @Column({ type: 'varchar', length: 36, nullable: true })
  sessionJti: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
