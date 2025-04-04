// scripts/seed-categories.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CategoriesService } from '../src/categories/categories.service';
import { User } from '../src/users/user.entity'; 

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const categoriesService = app.get(CategoriesService);

  const user: Partial<User> = { id: 10 } as User;

  const predefinedCategories = [
    // 🏠 Home & Utilities
    'Rent', 'Mortgage', 'Electricity', 'Gas', 'Water', 'Internet & Phone',
    'Housing Fees', 'Home Maintenance', 'Appliances',

    // 🚗 Transportation
    'Fuel', 'Car Insurance', 'Car Tax', 'Car Maintenance',
    'Public Transport', 'Parking / Tolls', 'Car / Scooter Rental',

    // 🛒 Daily Expenses
    'Groceries', 'Pharmacy', 'Personal Care', 'Tobacco',

    // 🍽️ Restaurants & Bars
    'Restaurant', 'Cafe / Breakfast', 'Takeaway / Delivery',

    // 🛍️ Shopping
    'Clothing', 'Electronics', 'Gifts', 'Books / Media',

    // 🎓 Education & Training
    'School / University', 'Textbooks', 'Courses / Educational Subscriptions',

    // ⚕️ Health
    'Medical Visits', 'Tests / Exams', 'Health Insurance',

    // 👶 Family & Children
    'Daycare / School', 'Children Clothing', 'Babysitter', 'Recreational Activities',

    // 🎉 Leisure
    'Travel', 'Streaming Subscriptions', 'Cinema / Theater', 'Events / Concerts', 'Sports / Gym',

    // 💼 Work & Professional
    'Professional Expenses', 'Business Utilities', 'Office Supplies',

    // 💸 Personal Finance
    'Savings', 'Investments', 'Donations', 'Bank Fees'
  ];

  for (const name of predefinedCategories) {
    try {
      await categoriesService.create({ name }, user as User);
      console.log(`✅ Category created: ${name}`);
    } catch (error) {
      console.error(`⚠️ Error creating "${name}":`, error.message);
    }
  }

  await app.close();
}

bootstrap();
