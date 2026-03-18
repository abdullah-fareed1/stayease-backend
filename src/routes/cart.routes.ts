import { Router } from 'express';
import { requireCustomerAuth } from '../middleware/authMiddleware';
import { getCart, addItemToCart, removeItemFromCart, clearCart, checkoutCart } from '../controllers/cart.controller';

const router = Router();

router.use(requireCustomerAuth);

router.get('/', getCart);
router.post('/items', addItemToCart);
router.delete('/items/:cartItemId', removeItemFromCart);
router.delete('/', clearCart);
router.post('/checkout', checkoutCart);

export default router;