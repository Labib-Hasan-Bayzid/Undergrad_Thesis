import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from './modules/users/user.entity';

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    entities: [UserEntity],
    synchronize: false,
  });

  await ds.initialize();
  const repo = ds.getRepository(UserEntity);

  const email = process.env.ADMIN_EMAIL || 'admin@autosphere.local';
  const password = process.env.ADMIN_PASSWORD || 'Admin@12345';

  const existing = await repo.findOne({ where: { email } });
  if (existing) {
    console.log('✅ Admin already exists:', email);
    await ds.destroy();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = repo.create({
    name: 'Admin',
    email,
    phone: '0000000000',
    city: 'Dhaka',
    role: 'admin',
    passwordHash,
    isVerified: true,
    isBlocked: false,
  });

  await repo.save(admin);
  console.log('✅ Admin created:', email);
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
