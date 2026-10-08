import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('purchase_rule')
export class PurchaseRule {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'ticket_type_id', type: 'bigint' })
  ticketTypeId: number;

  @Column({ name: 'per_user_per_order', type: 'int', default: 4 })
  perUserPerOrder: number;

  @Column({ name: 'per_user_per_day', type: 'int', default: 5 })
  perUserPerDay: number;

  @Column({ name: 'per_idcard_per_day', type: 'int', default: 1 })
  perIdcardPerDay: number;

  @Column({ name: 'updated_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
