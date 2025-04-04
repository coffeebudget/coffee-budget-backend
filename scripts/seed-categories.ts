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
    // 🏠 Casa & Utenze
    'Affitto', 'Mutuo', 'Energia elettrica', 'Gas', 'Acqua', 'Internet e telefono',
    'Spese condominiali', 'Manutenzione casa', 'Elettrodomestici',

    // 🚗 Trasporti
    'Carburante', 'Assicurazione auto', 'Bollo auto', 'Manutenzione auto',
    'Mezzi pubblici', 'Parcheggi / pedaggi', 'Noleggi auto / scooter',

    // 🛒 Spese quotidiane
    'Spesa alimentare', 'Farmacia', 'Cura personale', 'Tabacchi',

    // 🍽️ Ristoranti & bar
    'Ristorante', 'Bar / colazione', 'Take away / delivery',

    // 🛍️ Shopping
    'Abbigliamento', 'Elettronica', 'Regali', 'Libri / media',

    // 🎓 Istruzione & formazione
    'Scuola / università', 'Libri scolastici', 'Corsi / abbonamenti educativi',

    // ⚕️ Salute
    'Visite mediche', 'Analisi / esami', 'Assicurazioni sanitarie',

    // 👶 Famiglia & figli
    'Asilo / scuola', 'Abbigliamento bambini', 'Baby sitter', 'Attività ricreative',

    // 🎉 Tempo libero
    'Viaggi', 'Abbonamenti streaming', 'Cinema / teatro', 'Eventi / concerti', 'Sport / palestra',

    // 💼 Lavoro & professione
    'Spese professionali', 'Utenze business', 'Materiale da ufficio',

    // 💸 Finanza personale
    'Risparmi', 'Investimenti', 'Donazioni', 'Commissioni bancarie'
  ];

  for (const name of predefinedCategories) {
    try {
      await categoriesService.create({ name }, user as User);
      console.log(`✅ Categoria creata: ${name}`);
    } catch (error) {
      console.error(`⚠️ Errore creando "${name}":`, error.message);
    }
  }

  await app.close();
}

bootstrap();
